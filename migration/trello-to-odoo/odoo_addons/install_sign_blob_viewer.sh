#!/bin/bash
# Installs the sign_blob_viewer add-on on the Odoo server. Run as root from
# the Hetzner web console:
#   curl -fsSL "<script url>" | bash
# It finds the running Odoo, puts the module in a custom add-ons folder, adds
# that folder to Odoo's addons_path (keeping a backup of the config), and
# restarts Odoo. The module itself is then installed from Odoo's Apps.
set -euo pipefail
ZIP_URL="__ZIP_URL__"
MODULE=sign_blob_viewer
say() { printf '\n== %s\n' "$*"; }
fail() { printf '\nSTOPPED: %s\nNothing further was changed.\n' "$*"; exit 1; }

[ "$(id -u)" = 0 ] || fail "run this as root (log in as root, or prefix with sudo)."

say "Finding the running Odoo"
PID=$(pgrep -f 'odoo-bin|openerp-server|odoo.py' | head -1 || true)
[ -n "$PID" ] || PID=$(pgrep -f '[o]doo' | head -1 || true)
[ -n "$PID" ] || fail "no running Odoo process found."
CMD=$(tr '\0' ' ' < /proc/$PID/cmdline)
OUSER=$(ps -o user= -p "$PID" | tr -d ' ')
echo "process $PID, user $OUSER"
echo "command: $CMD"
echo "$CMD" | grep -q -- '--addons-path' && fail "Odoo's add-ons path is set on its command line, not in a config file; add the folder there by hand."

CONF=$(echo "$CMD" | grep -oE -- '(-c|--config)[ =][^ ]+' | head -1 | sed -E 's/^(-c|--config)[ =]//' || true)
if [ -z "$CONF" ]; then
  for c in /etc/odoo/odoo.conf /etc/odoo.conf /etc/odoo-server.conf /etc/odoo/odoo-server.conf /home/"$OUSER"/.odoorc /home/"$OUSER"/odoo.conf; do
    [ -f "$c" ] && CONF=$c && break
  done
fi
[ -n "$CONF" ] && [ -f "$CONF" ] || fail "could not find Odoo's config file."
echo "config: $CONF"
ADDONS=$(grep -E '^[[:space:]]*addons_path[[:space:]]*=' "$CONF" | head -1 | cut -d= -f2- | tr -d ' ' || true)
[ -n "$ADDONS" ] || fail "no addons_path line in $CONF; add the folder there by hand."
echo "addons_path: $ADDONS"

say "Placing the module"
CUSTOM=""
for p in $(echo "$ADDONS" | tr ',' ' '); do
  case "$p" in *custom*|*extra*) [ -d "$p" ] && CUSTOM=$p && break;; esac
done
[ -n "$CUSTOM" ] || CUSTOM=/opt/odoo-custom-addons
mkdir -p "$CUSTOM"
TMP=$(mktemp -d)
curl -fsSL "$ZIP_URL" -o "$TMP/m.zip" || fail "could not download the module."
python3 -m zipfile -e "$TMP/m.zip" "$TMP/x" || fail "the module download is not a valid zip."
[ -f "$TMP/x/$MODULE/__manifest__.py" ] || fail "the zip does not contain $MODULE."
if [ -d "$CUSTOM/$MODULE" ]; then mv "$CUSTOM/$MODULE" "$TMP/previous_$MODULE"; echo "previous copy kept in $TMP/previous_$MODULE"; fi
cp -r "$TMP/x/$MODULE" "$CUSTOM/"
chown -R "$OUSER": "$CUSTOM"
echo "module in $CUSTOM/$MODULE"

if ! echo ",$ADDONS," | grep -q ",$CUSTOM,"; then
  cp "$CONF" "$CONF.bak.$(date +%Y%m%d%H%M%S)"
  sed -i -E "s|^([[:space:]]*addons_path[[:space:]]*=[[:space:]]*).*|\1$ADDONS,$CUSTOM|" "$CONF"
  echo "added $CUSTOM to addons_path (backup of the config saved next to it)"
fi

say "Restarting Odoo"
SVC=$(systemctl list-units --type=service --all --no-legend 2>/dev/null | awk '{print $1}' | grep -iE 'odoo|openerp' | head -1 || true)
[ -n "$SVC" ] || fail "module is in place, but no Odoo systemd service was found to restart; restart Odoo by hand."
systemctl restart "$SVC"
for i in $(seq 1 60); do
  sleep 2
  if curl -fsS -o /dev/null "http://127.0.0.1:8069/web/login" 2>/dev/null; then
    say "Done: Odoo ($SVC) is back up with $MODULE available. Tell Claude it is finished."
    exit 0
  fi
done
fail "Odoo ($SVC) did not answer within 2 minutes after the restart. Check: systemctl status $SVC"
