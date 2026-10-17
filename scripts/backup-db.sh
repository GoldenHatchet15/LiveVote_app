#!/usr/bin/env bash
#
# Back up the LiveVote SQLite database from the running production stack.
# Produces a consistent snapshot (SQLite `VACUUM INTO`) and keeps the last
# KEEP_DAYS days. Intended to run from cron, e.g. daily at 03:00:
#   0 3 * * *  cd /path/to/livevote && ./scripts/backup-db.sh >> backups/backup.log 2>&1
#
# Restore: see DEPLOY.md ("Backup & restore").
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE="${COMPOSE:-docker compose -f docker-compose.prod.yml}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${KEEP_DAYS:-7}"

mkdir -p "$BACKUP_DIR"
ts="$(date +%Y%m%d-%H%M%S)"
out="$BACKUP_DIR/livevote-$ts.db"

echo "[backup] creating consistent snapshot…"
# SQLite online backup into a temp file inside the container, then copy it out.
if $COMPOSE exec -T app node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.\$executeRawUnsafe(\"VACUUM INTO '/app/data/_backup.db'\").then(()=>p.\$disconnect()).catch(e=>{console.error(e);process.exit(1)})"; then
  $COMPOSE cp app:/app/data/_backup.db "$out"
  $COMPOSE exec -T app rm -f /app/data/_backup.db || true
else
  echo "[backup] VACUUM INTO failed; falling back to a file copy"
  $COMPOSE cp app:/app/data/livevote.db "$out"
fi

gzip -f "$out"
echo "[backup] wrote ${out}.gz"

# Prune old backups.
find "$BACKUP_DIR" -name 'livevote-*.db.gz' -type f -mtime "+${KEEP_DAYS}" -print -delete || true
echo "[backup] done (keeping ${KEEP_DAYS} days)"
