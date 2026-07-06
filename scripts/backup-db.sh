#!/usr/bin/env bash
# Backup de la base de datos apuntada por DATABASE_URL vía pg_dump.
# Pensado para correr por cron en el servidor (requiere pg_dump instalado,
# viene con el paquete postgresql-client).
#
# Uso: ./backup-db.sh [directorio_destino] [días_de_retención]
set -euo pipefail

cd "$(dirname "$0")/.."

BACKUP_DIR="${1:-/var/backups/dyc-db}"
RETENTION_DAYS="${2:-14}"

if [ ! -f .env ]; then
  echo "No se encontró backend/.env" >&2
  exit 1
fi

DB_URL=$(grep -E '^DATABASE_URL=' .env | cut -d '=' -f2-)

mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
OUT_FILE="$BACKUP_DIR/dyc-db-$TIMESTAMP.sql.gz"

pg_dump "$DB_URL" --format=plain --no-owner --no-privileges | gzip > "$OUT_FILE"
echo "Backup creado: $OUT_FILE ($(du -h "$OUT_FILE" | cut -f1))"

# Borra backups más viejos que RETENTION_DAYS
find "$BACKUP_DIR" -name 'dyc-db-*.sql.gz' -mtime "+$RETENTION_DAYS" -delete

echo "Retención: se conservan los últimos $RETENTION_DAYS días."
