#!/bin/bash
# READ-ONLY assessment. Changes nothing. Run before installing anything.
echo "=== identity ==="; hostname; cat /etc/os-release | grep PRETTY; uname -m
echo; echo "=== memory (MB) ==="; free -m
echo; echo "=== swap ==="; swapon --show || echo "(no swap)"
echo; echo "=== disk ==="; df -h / /var 2>/dev/null
echo; echo "=== cpu ==="; nproc; grep -m1 "model name" /proc/cpuinfo 2>/dev/null
echo; echo "=== top memory consumers ==="; ps -eo pid,rss,comm --sort=-rss | head -12
echo; echo "=== docker ==="; docker --version 2>/dev/null || echo "docker NOT installed"
docker compose version 2>/dev/null || echo "compose plugin NOT installed"
echo "--- running containers ---"; docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}' 2>/dev/null || echo "(none / no docker)"
echo; echo "=== listening ports ==="; ss -lntp 2>/dev/null | head -25
echo; echo "=== nginx ==="; nginx -v 2>&1; ls /etc/nginx/sites-enabled/ 2>/dev/null
echo; echo "=== certbot ==="; certbot --version 2>&1 | head -2; certbot certificates 2>/dev/null | grep -E "Certificate Name|Domains|Expiry" || echo "(certbot not present or no certs)"
echo; echo "=== odoo service ==="; systemctl is-active odoo 2>/dev/null || echo "(no odoo systemd unit)"
systemctl list-units --type=service --state=running 2>/dev/null | head -20
