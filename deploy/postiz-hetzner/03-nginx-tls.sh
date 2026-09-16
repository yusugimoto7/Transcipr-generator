#!/bin/bash
# Publishes post.sugimotogroup.org through the EXISTING nginx and gets a
# certificate for that name only. Odoo's site file and cert are not touched.
set -euo pipefail
log(){ echo "[$(date +%H:%M:%S)] $*"; }

log "backing up nginx config"
tar czf "/root/nginx-backup-$(date +%F-%H%M).tar.gz" /etc/nginx

log "installing certbot if needed"
command -v certbot >/dev/null || { apt-get update -qq && apt-get install -y -qq certbot python3-certbot-nginx; }

log "issuing certificate for post.sugimotogroup.org (webroot, no nginx restart)"
mkdir -p /var/www/html
certbot certonly --webroot -w /var/www/html \
  -d post.sugimotogroup.org \
  --non-interactive --agree-tos -m yusugimoto7@gmail.com \
  --cert-name post.sugimotogroup.org

log "installing the postiz site"
cp /opt/postiz/postiz-site.nginx /etc/nginx/sites-available/postiz
ln -sf /etc/nginx/sites-available/postiz /etc/nginx/sites-enabled/postiz

log "testing nginx config BEFORE reloading (Odoo stays up if this fails)"
nginx -t
log "reloading nginx"
systemctl reload nginx

log "verifying Odoo still answers"
curl -s -o /dev/null -w 'odoo: HTTP %{http_code}\n' https://odoo.sugimotogroup.org/
curl -s -o /dev/null -w 'postiz: HTTP %{http_code}\n' https://post.sugimotogroup.org/
