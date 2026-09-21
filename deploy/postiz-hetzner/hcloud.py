#!/usr/bin/env python3
"""Hetzner Cloud driver for the Postiz deployment.

The API token is read from the environment variable HCLOUD_TOKEN so that it is
never written to disk by this script.

Subcommands:
  audit                 list servers with their real specs (READ ONLY)
  types                 list server types and monthly prices (READ ONLY)
  resetpw <server_id>   ask Hetzner to set a new root password, print it
  createkey             upload our public key to the project
  create <name>         create a new server that installs itself via cloud-init
"""
import json
import os
import sys
import urllib.error
import urllib.request

API = "https://api.hetzner.cloud/v1"


def token():
    t = os.environ.get("HCLOUD_TOKEN", "").strip()
    if not t:
        sys.exit("HCLOUD_TOKEN is not set in the environment.")
    return t


def call(method, path, body=None):
    req = urllib.request.Request(
        API + path,
        method=method,
        data=json.dumps(body).encode() if body else None,
        headers={"Authorization": "Bearer " + token(),
                 "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        sys.exit(f"HTTP {e.code} on {method} {path}\n{e.read().decode()[:600]}")


def audit():
    types = {t["name"]: t for t in call("GET", "/server_types?per_page=100")["server_types"]}
    servers = call("GET", "/servers?per_page=50")["servers"]
    if not servers:
        print("No servers found in this project.")
        return
    for s in servers:
        t = types.get(s["server_type"]["name"], {})
        ip = (s.get("public_net") or {}).get("ipv4") or {}
        print(f"name     : {s['name']}")
        print(f"id       : {s['id']}")
        print(f"type     : {s['server_type']['name']}")
        print(f"cpu      : {t.get('cores', '?')} vCPU")
        print(f"memory   : {t.get('memory', '?')} GB")
        print(f"disk     : {t.get('disk', '?')} GB")
        print(f"status   : {s['status']}")
        print(f"ipv4     : {ip.get('ip', '-')}")
        print(f"image    : {(s.get('image') or {}).get('description')}")
        print(f"location : {s['datacenter']['location']['name']}")
        print(f"backups  : {'on' if s.get('backup_window') else 'off'}")
        print("-" * 50)


def types_():
    for t in call("GET", "/server_types?per_page=100")["server_types"]:
        if t.get("deprecated"):
            continue
        price = None
        for p in t.get("prices", []):
            if p["location"] in ("fsn1", "nbg1"):
                price = float(p["price_monthly"]["gross"])
                break
        if price is not None and price < 25:
            print(f"{t['name']:<12}{t['cores']:>3} vCPU {t['memory']:>5} GB RAM "
                  f"{t['disk']:>4} GB disk  EUR {price:>6.2f}/mo  {t['architecture']}")


def resetpw(sid):
    r = call("POST", f"/servers/{sid}/actions/reset_password")
    print("action status:", r["action"]["status"])
    print("ROOT_PASSWORD:", r["root_password"])


def createkey():
    pub = open("/root/oci-postiz/postiz_ed25519.pub").read().strip()
    for k in call("GET", "/ssh_keys?per_page=50")["ssh_keys"]:
        if k["name"] == "claude-postiz":
            print("public key already present, id", k["id"])
            return k["id"]
    r = call("POST", "/ssh_keys", {"name": "claude-postiz", "public_key": pub})
    print("uploaded public key, id", r["ssh_key"]["id"])
    return r["ssh_key"]["id"]


def create(name):
    kid = createkey()
    user_data = open("/root/hetzner-postiz/cloud-init-postiz.yaml").read()
    body = {
        "name": name,
        "server_type": "cx22",
        "image": "ubuntu-24.04",
        "location": "fsn1",
        "ssh_keys": [kid],
        "user_data": user_data,
        "public_net": {"enable_ipv4": True, "enable_ipv6": True},
        "labels": {"purpose": "postiz"},
    }
    s = call("POST", "/servers", body)["server"]
    ip = s["public_net"]["ipv4"]["ip"]
    print("created server id", s["id"])
    print("PUBLIC_IP", ip)
    with open("/root/hetzner-postiz/server.json", "w") as f:
        json.dump({"id": s["id"], "ip": ip}, f, indent=1)


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "audit"
    actions = {
        "audit": audit,
        "types": types_,
        "resetpw": lambda: resetpw(sys.argv[2]),
        "createkey": createkey,
        "create": lambda: create(sys.argv[2] if len(sys.argv) > 2 else "postiz"),
    }
    if cmd not in actions:
        sys.exit(__doc__)
    actions[cmd]()
