#!/usr/bin/env bash
# Wrapper para gestionar usuarios admin desde el host.
# Usa el módulo Python dentro del contenedor api.
#
# Ejemplos:
#   ./scripts/manage-admin.sh list
#   ./scripts/manage-admin.sh create lautaro --generate-password
#   ./scripts/manage-admin.sh reset lautaro
#
# Producción Lyntrix:
#   COMPOSE_FILE=deploy/docker-compose.yml ./scripts/manage-admin.sh list
#   # o: export COMPOSE_FILE=deploy/docker-compose.yml

set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE=(docker compose)
if [[ -n "${COMPOSE_FILE:-}" ]]; then
  COMPOSE=(docker compose -f "$COMPOSE_FILE")
elif [[ -f deploy/docker-compose.yml ]] && docker compose -f deploy/docker-compose.yml ps api --status running 2>/dev/null | grep -q running; then
  COMPOSE=(docker compose -f deploy/docker-compose.yml)
fi

if ! "${COMPOSE[@]}" ps api --status running 2>/dev/null | grep -q running; then
  echo "Error: el contenedor api no está en ejecución."
  echo "Local:  docker compose up -d"
  echo "Prod:   docker compose -f deploy/docker-compose.yml --env-file .env up -d"
  exit 1
fi

"${COMPOSE[@]}" exec -T api python -m app.cli.manage_admin "$@"
