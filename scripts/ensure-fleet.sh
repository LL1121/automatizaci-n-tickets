#!/usr/bin/env bash
# Alta manual de patentes de la flota en Postgres (idempotente).
# Ejecutar desde la raíz del repo, con api y db levantados:
#   ./scripts/ensure-fleet.sh

set -euo pipefail
cd "$(dirname "$0")/.."

if ! docker compose ps api --status running 2>/dev/null | grep -q running; then
  echo "Error: el contenedor api no está en ejecución. Levantá con: docker compose up -d"
  exit 1
fi

docker compose exec api python -m app.cli.ensure_fleet
