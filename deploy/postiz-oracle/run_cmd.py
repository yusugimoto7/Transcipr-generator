#!/usr/bin/env python3
"""Run a shell script on the OCI instance via Run Command. Usage: run_cmd.py [-t timeout] 'script' | -f file"""
import oci, sys, time, json, argparse
ap = argparse.ArgumentParser(); ap.add_argument("-t", type=int, default=900); ap.add_argument("-f"); ap.add_argument("script", nargs="?")
a = ap.parse_args()
script = open(a.f).read() if a.f else a.script
cfg = oci.config.from_file(); st = json.load(open("/root/oci-postiz/state.json"))
cl = oci.compute_instance_agent.ComputeInstanceAgentClient(cfg)
m = oci.compute_instance_agent.models
cmd = cl.create_instance_agent_command(m.CreateInstanceAgentCommandDetails(
    compartment_id=cfg["tenancy"], execution_time_out_in_seconds=a.t, display_name="claude-cmd",
    target=m.InstanceAgentCommandTarget(instance_id=st["instance_id"]),
    content=m.InstanceAgentCommandContent(
        source=m.InstanceAgentCommandSourceViaTextDetails(source_type="TEXT", text=script),
        output=m.InstanceAgentCommandOutputViaTextDetails(output_type="TEXT")))).data
deadline = time.time() + a.t + 120
while time.time() < deadline:
    ex = cl.get_instance_agent_command_execution(cmd.id, st["instance_id"]).data
    if ex.lifecycle_state in ("SUCCEEDED", "FAILED", "TIMED_OUT", "CANCELED"):
        c = ex.content
        print(f"[{ex.lifecycle_state} exit={getattr(c,'exit_code',None)}]")
        print(getattr(c, "text", "") or "", end="")
        if getattr(c, "message", None): print("\nMSG:", c.message)
        sys.exit(0 if ex.lifecycle_state == "SUCCEEDED" else 1)
    time.sleep(5)
print("timed out waiting"); sys.exit(2)
