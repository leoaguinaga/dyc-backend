#!/usr/bin/env bash
# Programa el backup diario de la base (RNF-08) en el crontab del usuario actual.
# Idempotente: si la línea ya existe, la reemplaza.
#
# Uso: ./install-backup-cron.sh [hora 0-23, zona del servidor] [directorio_destino] [días_de_retención]
set -euo pipefail

HORA="${1:-3}"
BACKUP_DIR="${2:-/var/backups/dyc-db}"
RETENTION_DAYS="${3:-14}"

SCRIPT="$(cd "$(dirname "$0")" && pwd)/backup-db.sh"
LOG="$BACKUP_DIR/backup.log"
MARCA="# dyc-backup-db"

mkdir -p "$BACKUP_DIR"
chmod +x "$SCRIPT"

LINEA="0 $HORA * * * $SCRIPT $BACKUP_DIR $RETENTION_DAYS >> $LOG 2>&1 $MARCA"
# Se lee el crontab completo antes de escribir para no perder otras tareas.
ACTUAL=$(crontab -l 2>/dev/null | grep -v "$MARCA" || true)
printf '%s\n%s\n' "$ACTUAL" "$LINEA" | sed '/^$/d' | crontab -

echo "Backup diario programado a las $HORA:00 (hora del servidor: $(date +%Z)):"
crontab -l | grep "$MARCA"
echo "Log: $LOG"
