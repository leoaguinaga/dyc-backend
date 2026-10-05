#!/usr/bin/env bash
# Backup de la base de datos apuntada por DATABASE_URL vía pg_dump (RNF-08).
# Pensado para correr por cron en el servidor (ver scripts/install-backup-cron.sh).
# Requiere un pg_dump de la misma versión mayor que el servidor o más nueva
# (Neon corre PostgreSQL 18 → paquete postgresql-client-18).
#
# Uso: ./backup-db.sh [directorio_destino] [días_de_retención]
# DATABASE_URL se toma del entorno o, si no está, de backend/.env.
set -euo pipefail

cd "$(dirname "$0")/.."

BACKUP_DIR="${1:-/var/backups/dyc-db}"
RETENTION_DAYS="${2:-14}"

DB_URL="${DATABASE_URL:-}"
if [ -z "$DB_URL" ]; then
  if [ ! -f .env ]; then
    echo "No hay DATABASE_URL en el entorno ni backend/.env" >&2
    exit 1
  fi
  DB_URL=$(grep -E '^DATABASE_URL=' .env | cut -d '=' -f2- | tr -d '"' | tr -d "'")
fi

# uselibpqcompat es un parámetro del driver de Node (pg), libpq lo rechaza.
DB_URL=$(printf '%s' "$DB_URL" | sed -E 's/([?&])uselibpqcompat=[^&]*&?/\1/; s/[?&]$//')
# pg_dump necesita una sesión completa: en Neon se usa el host directo, no el pooler.
DB_URL=$(printf '%s' "$DB_URL" | sed -E 's/-pooler\././')

server_major=$(psql "$DB_URL" -Atc 'SHOW server_version_num' | cut -c1-2)
dump_major=$(pg_dump --version | grep -oE '[0-9]+' | head -1)
if [ "$dump_major" -lt "$server_major" ]; then
  echo "pg_dump $dump_major es más antiguo que el servidor PostgreSQL $server_major." >&2
  echo "Instala postgresql-client-$server_major (o libpq $server_major) y vuelve a intentar." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
OUT_FILE="$BACKUP_DIR/dyc-db-$TIMESTAMP.sql.gz"
TMP_FILE="$OUT_FILE.part"

# Se escribe a un .part y se renombra al final: un dump cortado nunca queda
# con el nombre de un backup válido.
trap 'rm -f "$TMP_FILE"' EXIT
pg_dump "$DB_URL" --format=plain --no-owner --no-privileges | gzip > "$TMP_FILE"
gzip -t "$TMP_FILE"
mv "$TMP_FILE" "$OUT_FILE"
echo "Backup creado: $OUT_FILE ($(du -h "$OUT_FILE" | cut -f1))"

# Borra backups más viejos que RETENTION_DAYS
find "$BACKUP_DIR" -name 'dyc-db-*.sql.gz' -mtime "+$RETENTION_DAYS" -delete

echo "Retención: se conservan los últimos $RETENTION_DAYS días."
