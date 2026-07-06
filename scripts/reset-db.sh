#!/usr/bin/env bash
# Vacía la base de datos apuntada por DATABASE_URL (dropea el schema y reaplica
# todas las migraciones de prisma/migrations). Requiere confirmación explícita
# porque destruye todos los datos existentes.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "No se encontró backend/.env" >&2
  exit 1
fi

DB_URL=$(grep -E '^DATABASE_URL=' .env | cut -d '=' -f2-)
DB_HOST=$(echo "$DB_URL" | sed -E 's#.*@([^/]+)/.*#\1#')
DB_NAME=$(echo "$DB_URL" | sed -E 's#.*/([^?]+)(\?.*)?#\1#')

echo "Esto va a DROPEAR y RECREAR el schema completo en:"
echo "  host: $DB_HOST"
echo "  db:   $DB_NAME"
echo
read -rp "Escribí el nombre de la base de datos ($DB_NAME) para confirmar: " CONFIRM
if [ "$CONFIRM" != "$DB_NAME" ]; then
  echo "Confirmación no coincide. Abortado." >&2
  exit 1
fi

read -rp "Motivo del reset (se usa como consentimiento de Prisma): " REASON
if [ -z "$REASON" ]; then
  echo "Se requiere un motivo. Abortado." >&2
  exit 1
fi

PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="$REASON" npx prisma migrate reset --force --skip-seed
echo "Reset completado."
