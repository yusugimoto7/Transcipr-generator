# Postiz on Oracle Cloud Always Free (ARM)

Files used to run Postiz for Sugimoto Visa at https://post.sugimotogroup.org
on an Oracle Cloud Always Free `VM.Standard.A1.Flex` server in Toronto.

| File | Purpose |
|---|---|
| `create.py` | Creates the VCN, subnet, firewall rules and launches the instance (retries on "Out of host capacity"). |
| `cloud-init.yaml` | First-boot script: opens ports 80/443 in the Ubuntu image firewall, installs Docker. |
| `run_cmd.py` | Runs a shell script on the server through Oracle's Run Command API (no SSH needed). |
| `docker-compose.yaml` | Postiz stack, trimmed (no spotlight / temporal-ui / admin-tools) and hardened. |
| `nginx.conf` | Upstream nginx.conf with `proxy_pass` patched to `127.0.0.1` (IPv6 502 fix). |
| `Caddyfile` | Automatic Let's Encrypt HTTPS in front of Postiz. |
| `env.example` | Environment template; the real `.env` lives only on the server. |
| `backup.sh` | Nightly database + uploads backup, 7-day retention. |

Hardening carried over from `deploy/postiz/docker-compose.override.yaml`:
`restart: always` on every Temporal service, healthchecks on
`temporal-postgresql` and `temporal`, and `depends_on: service_healthy`
from `postiz` to `temporal`.
