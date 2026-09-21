# Postiz on the existing Hetzner server (alongside Odoo)

Target: `https://post.sugimotogroup.org` on 78.47.96.58, the same box that
already serves `odoo.sugimotogroup.org`.

## Why this differs from the Oracle bundle

That box already runs **nginx 1.18.0** on ports 80 and 443 for Odoo. A second
reverse proxy (Caddy) would fight it for those ports and take Odoo down. So:

- Postiz binds **127.0.0.1:4007 only**. Nothing in Docker touches 80 or 443.
- The existing nginx gets **one new site file** for `post.sugimotogroup.org`.
  The Odoo server block is never edited.
- certbot issues a certificate for the new name only, via the webroot method,
  so Odoo's certificate and nginx's running state are untouched.
- `nginx -t` runs before any reload. A bad config aborts before Odoo notices.
- The whole of `/etc/nginx` is tarred to `/root/` before any change.

## Order of operations

| Script | Does |
|---|---|
| `01-assess.sh` | Read-only. RAM, swap, disk, Docker, ports, nginx sites, certs, services. Changes nothing. |
| `02-install.sh` | Installs Docker if missing, adds 4G swap if there is none, brings the stack up on loopback 4007. |
| `03-nginx-tls.sh` | Backs up nginx, issues the certificate, adds the site, tests, reloads, verifies Odoo and Postiz both answer. |

## Hardening carried over

`restart: always` on every Temporal service, healthchecks on
`temporal-postgresql` and `temporal`, `depends_on: service_healthy` from
`postiz` to `temporal`, and the container's own nginx patched from `localhost`
to `127.0.0.1` to avoid the IPv6 502.

## DNS required first

`03-nginx-tls.sh` cannot issue a certificate until this record exists:

| Type | Host | Value | TTL |
|---|---|---|---|
| A | `post` | `78.47.96.58` | 3600 |

## Route B: a fresh server, installed with no SSH at all

`cloud-init-postiz.yaml` is a complete unattended install. Hetzner runs it as
root on first boot, so the machine builds itself: swap, Docker, the hardened
Postiz stack, Caddy with automatic HTTPS, and a nightly backup at 03:30.
Nobody logs in, and no SSH password exists anywhere in the process.

`hcloud.py` drives the Hetzner Cloud API. It reads the token from the
`HCLOUD_TOKEN` environment variable and never writes it to disk.

| Command | Effect |
|---|---|
| `hcloud.py audit` | Print every server with its real CPU, memory and disk. Read only. |
| `hcloud.py types` | Print server types and monthly prices. Read only. |
| `hcloud.py resetpw <id>` | Ask Hetzner to set a new root password and print it. |
| `hcloud.py createkey` | Upload our public key to the project. |
| `hcloud.py create <name>` | Create a server that installs itself from the cloud-init file. |

Progress is written to `/var/log/postiz-bootstrap.log` on the new machine.
