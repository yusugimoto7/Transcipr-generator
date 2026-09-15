import oci, sys, time, base64, json, os
MAX_ATTEMPTS = int(os.environ.get('MAX_ATTEMPTS','4'))
cfg = oci.config.from_file(); oci.config.validate_config(cfg)
C = cfg["tenancy"]
vn = oci.core.VirtualNetworkClient(cfg); cc = oci.core.ComputeClient(cfg); idc = oci.identity.IdentityClient(cfg)
AD = idc.list_availability_domains(C).data[0].name
state = {}
def find(lst, name): 
    for x in lst:
        if x.display_name == name and x.lifecycle_state not in ("TERMINATED","TERMINATING"): return x
# VCN
vcn = find(vn.list_vcns(C).data, "postiz-vcn") or vn.create_vcn(oci.core.models.CreateVcnDetails(compartment_id=C, cidr_block="10.0.0.0/16", display_name="postiz-vcn", dns_label="postiz")).data
oci.wait_until(vn, vn.get_vcn(vcn.id), "lifecycle_state", "AVAILABLE"); vcn = vn.get_vcn(vcn.id).data
print("vcn", vcn.id)
igw = find(vn.list_internet_gateways(C, vcn_id=vcn.id).data, "postiz-igw") or vn.create_internet_gateway(oci.core.models.CreateInternetGatewayDetails(compartment_id=C, vcn_id=vcn.id, is_enabled=True, display_name="postiz-igw")).data
oci.wait_until(vn, vn.get_internet_gateway(igw.id), "lifecycle_state", "AVAILABLE")
rt = vn.get_route_table(vcn.default_route_table_id).data
if not any(r.network_entity_id == igw.id for r in rt.route_rules):
    vn.update_route_table(rt.id, oci.core.models.UpdateRouteTableDetails(route_rules=[oci.core.models.RouteRule(destination="0.0.0.0/0", destination_type="CIDR_BLOCK", network_entity_id=igw.id)]))
sl = vn.get_security_list(vcn.default_security_list_id).data
def tcp(port): return oci.core.models.IngressSecurityRule(protocol="6", source="0.0.0.0/0", source_type="CIDR_BLOCK", is_stateless=False, tcp_options=oci.core.models.TcpOptions(destination_port_range=oci.core.models.PortRange(min=port, max=port)))
vn.update_security_list(sl.id, oci.core.models.UpdateSecurityListDetails(
    ingress_security_rules=[tcp(22), tcp(80), tcp(443), oci.core.models.IngressSecurityRule(protocol="1", source="0.0.0.0/0", icmp_options=oci.core.models.IcmpOptions(type=3, code=4))],
    egress_security_rules=[oci.core.models.EgressSecurityRule(protocol="all", destination="0.0.0.0/0")]))
sub = find(vn.list_subnets(C, vcn_id=vcn.id).data, "postiz-public") or vn.create_subnet(oci.core.models.CreateSubnetDetails(compartment_id=C, vcn_id=vcn.id, cidr_block="10.0.0.0/24", display_name="postiz-public", dns_label="pub", prohibit_public_ip_on_vnic=False)).data
oci.wait_until(vn, vn.get_subnet(sub.id), "lifecycle_state", "AVAILABLE")
print("subnet", sub.id)
# image
imgs = cc.list_images(C, operating_system="Canonical Ubuntu", operating_system_version="24.04", shape="VM.Standard.A1.Flex", sort_by="TIMECREATED", sort_order="DESC").data
imgs = [i for i in imgs if "aarch64" in i.display_name]
img = imgs[0]; print("image", img.display_name)
ud = base64.b64encode(open("/root/oci-postiz/cloud-init.yaml","rb").read()).decode()
pub = open("/root/oci-postiz/postiz_ed25519.pub").read().strip()
existing = find(cc.list_instances(C).data, "postiz")
if existing:
    inst = existing; print("instance exists", inst.id, inst.lifecycle_state)
else:
    details = oci.core.models.LaunchInstanceDetails(
        availability_domain=AD, compartment_id=C, display_name="postiz",
        shape="VM.Standard.A1.Flex",
        shape_config=None,
        source_details=oci.core.models.InstanceSourceViaImageDetails(image_id=img.id, boot_volume_size_in_gbs=100),
        create_vnic_details=oci.core.models.CreateVnicDetails(subnet_id=sub.id, assign_public_ip=True, display_name="postiz-vnic", hostname_label="postiz"),
        metadata={"ssh_authorized_keys": pub, "user_data": ud},
        agent_config=oci.core.models.LaunchInstanceAgentConfigDetails(is_monitoring_disabled=False, is_management_disabled=False,
            plugins_config=[oci.core.models.InstanceAgentPluginConfigDetails(name="Compute Instance Run Command", desired_state="ENABLED"),
                            oci.core.models.InstanceAgentPluginConfigDetails(name="Compute Instance Monitoring", desired_state="ENABLED")]),
        is_pv_encryption_in_transit_enabled=True)
    attempt = 0
    while True:
        attempt += 1
        big = attempt % 3 != 0
        details.shape_config = oci.core.models.LaunchInstanceShapeConfigDetails(ocpus=2 if big else 1, memory_in_gbs=12 if big else 6)
        try:
            inst = cc.launch_instance(details).data; print("launched", inst.id, "ocpus", details.shape_config.ocpus, flush=True); break
        except oci.exceptions.ServiceError as e:
            print(f"attempt {attempt}: {e.status} {e.code}: {e.message[:160]}", flush=True)
            if attempt >= MAX_ATTEMPTS:
                print("batch exhausted", flush=True); sys.exit(3)
            if e.status == 429:
                time.sleep(200); continue
            if e.status == 500 or "capacity" in e.message.lower():
                time.sleep(140); continue
            raise
oci.wait_until(cc, cc.get_instance(inst.id), "lifecycle_state", "RUNNING", max_wait_seconds=900)
vnic_id = cc.list_vnic_attachments(C, instance_id=inst.id).data[0].vnic_id
vnic = vn.get_vnic(vnic_id).data
print("PUBLIC_IP", vnic.public_ip)
json.dump({"instance_id": inst.id, "public_ip": vnic.public_ip, "subnet": sub.id, "vcn": vcn.id}, open("/root/oci-postiz/state.json","w"), indent=1)
