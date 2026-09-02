#!/bin/bash
# Deploy mesa-api only (no mesa-pos build). For servers where POS is uploaded separately.
#
# Required env:
#   export REPO_DIR="/home/restaurant-pos.isarva.in/Restaurant-POS"
#
# Optional:
#   export PM2_APP_NAME="mesa-api"
#   export SKIP_NPM_INSTALL=0

set -euo pipefail

# shellcheck disable=SC1091
source "$(dirname "$0")/env.sh"

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "$0")/../../" && pwd)}"
PM2_APP_NAME="${PM2_APP_NAME:-mesa-api}"
SKIP_NPM_INSTALL="${SKIP_NPM_INSTALL:-0}"
API_DIR="${REPO_DIR}/mesa-api"

if [[ ! -d "${API_DIR}" ]]; then
  echo "ERROR: mesa-api not found under REPO_DIR=${REPO_DIR}"
  exit 1
fi

install_deps() {
  local dir="$1"
  if [[ "${SKIP_NPM_INSTALL}" == "1" ]]; then
    return 0
  fi
  echo "-> npm ci in ${dir}"
  (cd "$dir" && npm ci)
}

echo "=== Deploy mesa-api (backend only) ==="
install_deps "${API_DIR}"

if [[ ! -f "${API_DIR}/.env" ]]; then
  echo "ERROR: ${API_DIR}/.env missing. Copy from .env.example and configure DATABASE_URL, JWT_SECRET, etc."
  exit 1
fi

(cd "${API_DIR}" && npx prisma generate)
(cd "${API_DIR}" && npm run build)
(cd "${API_DIR}" && npx prisma migrate deploy)

if command -v pm2 >/dev/null 2>&1; then
  if run_pm2 describe "${PM2_APP_NAME}" >/dev/null 2>&1; then
    run_pm2 restart "${PM2_APP_NAME}" --update-env
  else
    (cd "${REPO_DIR}" && run_pm2 start deploy/cyberpanel/ecosystem.config.cjs --only "${PM2_APP_NAME}")
  fi
  run_pm2 save
  echo "mesa-api running under PM2 (${PM2_APP_NAME})"
else
  echo "WARN: pm2 not found. Start API manually: cd ${API_DIR} && npm run start"
fi

echo "Deploy complete."
echo "  API: port from ${API_DIR}/.env (default 3001) — reverse-proxy to api subdomain"
