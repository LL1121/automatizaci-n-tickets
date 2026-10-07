#!/usr/bin/env bash
# Script interactivo para crear un nuevo usuario administrador del panel.
# Delega en el CLI Python dentro del contenedor api.
#
# Uso:
#   ./scripts/create-admin.sh                    # interactivo
#   ./scripts/create-admin.sh -u lautaro         # interactivo, ya con usuario
#   ./scripts/create-admin.sh -u lautaro -g      # genera contraseña aleatoria
#   ./scripts/create-admin.sh -u lautaro -n "Lautaro Pedro López"
#
# Flags:
#   -u <usuario>          Nombre de usuario (3–64, letras/números . _ -)
#   -n <"nombre y apellido">  Nombre completo visible en el panel
#   -p <contraseña>       Contraseña explícita (evitalo en historial de shell)
#   -g                    Generar contraseña aleatoria segura
#   -h                    Mostrar esta ayuda

set -euo pipefail
cd "$(dirname "$0")/.."

USERNAME=""
FULL_NAME=""
PASSWORD=""
GENERATE=0

usage() {
  sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'
}

while getopts ":u:n:p:gh" opt; do
  case "$opt" in
    u) USERNAME="$OPTARG" ;;
    n) FULL_NAME="$OPTARG" ;;
    p) PASSWORD="$OPTARG" ;;
    g) GENERATE=1 ;;
    h) usage; exit 0 ;;
    \?) echo "Flag desconocido: -$OPTARG" >&2; usage; exit 2 ;;
    :) echo "El flag -$OPTARG necesita un valor." >&2; exit 2 ;;
  esac
done

if [[ -n "$PASSWORD" && $GENERATE -eq 1 ]]; then
  echo "No podés combinar -p con -g." >&2
  exit 2
fi

if [[ -z "${COMPOSE_CMD+x}" ]]; then
  COMPOSE_CMD=(docker compose)
  if [[ -n "${COMPOSE_FILE:-}" ]]; then
    COMPOSE_CMD=(docker compose -f "$COMPOSE_FILE")
  elif docker compose -f deploy/docker-compose.yml ps api --status running --format '{{.State}}' 2>/dev/null | grep -qx running; then
    COMPOSE_CMD=(docker compose -f deploy/docker-compose.yml)
  fi
  # Producción exige .env (DB_USER, etc.). Sin eso, compose no ve el proyecto.
  if [[ ${COMPOSE_CMD[*]} == *deploy/docker-compose.yml* && -f .env ]]; then
    COMPOSE_CMD+=(--env-file .env)
  fi
fi

# `ps` muestra "Up …", no la palabra "running". El estado real está en {{.State}}.
if ! "${COMPOSE_CMD[@]}" ps api --status running --format '{{.State}}' 2>/dev/null | grep -qx running; then
  echo "Error: el contenedor api no está en ejecución."
  echo "Local:  docker compose up -d"
  echo "Prod:   docker compose -f deploy/docker-compose.yml --env-file .env up -d"
  exit 1
fi

if [[ -z "$USERNAME" ]]; then
  read -rp "Usuario: " USERNAME
fi
USERNAME="$(echo "$USERNAME" | tr -d '[:space:]')"
if [[ -z "$USERNAME" ]]; then
  echo "Error: el usuario no puede quedar vacío." >&2
  exit 2
fi

if [[ -z "$FULL_NAME" ]]; then
  read -rp "Nombre y apellido (opcional, ENTER para omitir): " FULL_NAME || true
fi

ARGS=(create "$USERNAME")
if [[ -n "$FULL_NAME" ]]; then
  ARGS+=(--full-name "$FULL_NAME")
fi

if [[ $GENERATE -eq 1 ]]; then
  ARGS+=(--generate-password)
elif [[ -n "$PASSWORD" ]]; then
  ARGS+=(--password "$PASSWORD")
fi

echo
echo "Creando admin en la base de datos…"
echo "  Usuario   : $USERNAME"
[[ -n "$FULL_NAME" ]] && echo "  Nombre    : $FULL_NAME"
if [[ $GENERATE -eq 1 ]]; then
  echo "  Contraseña: (se generará aleatoria)"
elif [[ -n "$PASSWORD" ]]; then
  echo "  Contraseña: (provista por flag -p)"
else
  echo "  Contraseña: (te la va a pedir el contenedor)"
fi
echo

# Si vamos a leer la contraseña interactivamente dentro del contenedor (getpass),
# necesitamos TTY (sin -T). Si la contraseña la pasamos por flag o se autogenera,
# no hace falta TTY y -T evita problemas en cron/CI.
EXEC_FLAGS=()
if [[ $GENERATE -eq 1 || -n "$PASSWORD" ]]; then
  EXEC_FLAGS+=(-T)
fi

"${COMPOSE_CMD[@]}" exec "${EXEC_FLAGS[@]}" api python -m app.cli.manage_admin "${ARGS[@]}"

echo
echo "Listo. Entrá con ese usuario en /admin/login."
