#!/bin/bash
# Installs Postiz alongside Odoo. Does NOT modify the Odoo nginx site,
# does NOT bind 80/443 from Docker, does NOT touch certbot's Odoo cert.
set -euo pipefail
log(){ echo "[$(date +%H:%M:%S)] $*"; }

log "installing docker if needed"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com -o /tmp/get-docker.sh && sh /tmp/get-docker.sh
  systemctl enable --now docker
fi

log "adding swap if memory is tight and no swap exists"
if [ "$(swapon --show --noheadings | wc -l)" -eq 0 ]; then
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  log "4G swap added"
else
  log "swap already present, leaving it alone"
fi

log "starting the Postiz stack (loopback port 4007 only)"
cd /opt/postiz
docker compose pull -q
docker compose up -d
log "waiting for Postiz to answer on 127.0.0.1:4007"
for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:4007/ || true)
  [ "$code" != "000" ] && { log "Postiz responded with HTTP $code after ${i}0s"; break; }
  sleep 10
done
docker compose ps
