#!/usr/bin/env bash
# Wrapper para gestionar usuarios admin desde el host.
# Usa el módulo Python dentro del contenedor api.
#
# Ejemplos:
#   ./scripts/manage-admin.sh list
#   ./scripts/manage-admin.sh create lautaro
#   ./scripts/manage-admin.sh create lautaro --generate-password
#   ./scripts/manage-admin.sh reset lautaro
#   ./scripts/manage-admin.sh deactivate ana
#   ./scripts/manage-admin.sh activate ana

set -euo pipefail
cd "$(dirname "$0")/.."

if ! docker compose ps api --status running 2>/dev/null | grep -q running; then
  echo "Error: el contenedor api no está en ejecución. Levantá con: docker compose up -d"
  exit 1
fi

docker compose exec -T api python -m app.cli.manage_admin "$@"
