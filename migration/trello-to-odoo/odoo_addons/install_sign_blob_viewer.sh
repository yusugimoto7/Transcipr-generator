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

say "Backing up before any change"
# Everything Odoo holds, taken before anything is touched: each database as a
# PostgreSQL dump (consistent while Odoo keeps running), the filestore
# (uploaded files, signed PDFs, passports), the config file and the list of
# installed modules, with the commands to put it all back in RESTORE.txt.
STAMP=$(date +%Y%m%d-%H%M%S)
BK=/root/odoo-backup-$STAMP
DATA_DIR=$(grep -E '^[[:space:]]*data_dir[[:space:]]*=' "$CONF" | head -1 | cut -d= -f2- | tr -d ' ' || true)
[ -n "$DATA_DIR" ] || DATA_DIR=$(getent passwd "$OUSER" | cut -d: -f6)/.local/share/Odoo
DBUSER=$(grep -E '^[[:space:]]*db_user[[:space:]]*=' "$CONF" | head -1 | cut -d= -f2- | tr -d ' ' || true)
[ -n "$DBUSER" ] && [ "$DBUSER" != "False" ] || DBUSER=$OUSER
DBS=$(runuser -u postgres -- psql -Atc "SELECT datname FROM pg_database WHERE NOT datistemplate AND datname <> 'postgres'" 2>/dev/null) \
  || fail "could not list the PostgreSQL databases (is PostgreSQL on this server?)."
[ -n "$DBS" ] || fail "no Odoo databases found."
echo "databases: $(echo $DBS)"
echo "filestore: $DATA_DIR/filestore"
NEED=0
for db in $DBS; do
  n=$(runuser -u postgres -- psql -Atc "SELECT pg_database_size('$db')" 2>/dev/null || echo 0)
  NEED=$((NEED + n))
done
[ -d "$DATA_DIR/filestore" ] && NEED=$((NEED + $(du -sb "$DATA_DIR/filestore" | cut -f1)))
FREE=$(( $(df -B1 --output=avail /root | tail -1) ))
echo "space needed (at most): $((NEED/1048576)) MB, free: $((FREE/1048576)) MB"
[ "$FREE" -gt $((NEED + 2147483648)) ] || fail "not enough free disk space for a full backup (need $((NEED/1048576)) MB plus 2 GB to spare)."
mkdir -p "$BK"
chmod 700 "$BK"
for db in $DBS; do
  echo "dumping $db ..."
  runuser -u postgres -- pg_dump -Fc -f "/tmp/$db.$STAMP.dump" "$db" || fail "pg_dump of $db failed."
  mv "/tmp/$db.$STAMP.dump" "$BK/$db.dump"
  if [ -d "$DATA_DIR/filestore/$db" ]; then
    echo "archiving the files of $db ..."
    tar -C "$DATA_DIR/filestore" -czf "$BK/filestore-$db.tar.gz" "$db" || fail "archiving the filestore of $db failed."
  fi
  runuser -u postgres -- psql -d "$db" -Atc "SELECT name, state, latest_version FROM ir_module_module WHERE state = 'installed' ORDER BY name" > "$BK/modules-$db.txt" 2>/dev/null || true
done
cp "$CONF" "$BK/$(basename "$CONF")"
SVC0=$(systemctl list-units --type=service --all --no-legend 2>/dev/null | awk '{print $1}' | grep -iE 'odoo|openerp' | head -1 || true)
{
  echo "Backup of Odoo taken $STAMP, before installing $MODULE."
  echo "Contents: one .dump per database, filestore-<db>.tar.gz per database, the Odoo"
  echo "config file as it was, and modules-<db>.txt (installed modules at the time)."
  echo
  echo "To put everything back exactly as it was, run as root:"
  echo
  echo "  systemctl stop ${SVC0:-<odoo service>}"
  echo "  cp \"$BK/$(basename "$CONF")\" \"$CONF\""
  echo "  rm -rf <custom add-ons folder>/$MODULE      # the folder printed by the installer"
  for db in $DBS; do
    echo
    echo "  # database $db"
    echo "  sudo -u postgres dropdb \"$db\""
    echo "  sudo -u postgres createdb -O \"$DBUSER\" \"$db\""
    echo "  sudo -u postgres pg_restore -d \"$db\" --no-owner --role=\"$DBUSER\" \"$BK/$db.dump\""
    if [ -f "$BK/filestore-$db.tar.gz" ]; then
      echo "  rm -rf \"$DATA_DIR/filestore/$db\""
      echo "  tar -C \"$DATA_DIR/filestore\" -xzf \"$BK/filestore-$db.tar.gz\""
      echo "  chown -R $OUSER: \"$DATA_DIR/filestore/$db\""
    fi
  done
  echo
  echo "  systemctl start ${SVC0:-<odoo service>}"
  echo
  echo "The database and filestore lines bring back the data; the config and module"
  echo "lines only undo this installation."
} > "$BK/RESTORE.txt"
ls -la "$BK"
echo "backup complete: $BK ($(du -sh "$BK" | cut -f1))"

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
    say "Done: Odoo ($SVC) is back up with $MODULE available (not switched on yet). Backup: $BK. Tell Claude it is finished."
    exit 0
  fi
done
fail "Odoo ($SVC) did not answer within 2 minutes after the restart. Check: systemctl status $SVC"
