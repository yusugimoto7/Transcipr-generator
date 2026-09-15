#!/bin/bash
# Nightly Postiz backup: database dump + uploads + config, keeps 7 days.
set -euo pipefail
DEST=/opt/postiz/backups; mkdir -p "$DEST"; STAMP=$(date +%F)
docker exec postiz-postgres pg_dump -U postiz-user postiz-db-local | gzip > "$DEST/db-$STAMP.sql.gz"
docker run --rm -v postiz_postiz-uploads:/uploads:ro -v postiz_postiz-config:/config:ro -v "$DEST":/backup alpine \
  tar czf "/backup/files-$STAMP.tar.gz" /uploads /config
cp /opt/postiz/.env "$DEST/env-$STAMP.bak"; chmod 600 "$DEST"/env-*.bak
find "$DEST" -type f -mtime +7 -delete
echo "backup ok $STAMP"
