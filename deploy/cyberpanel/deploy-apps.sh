#!/bin/bash
# Build and deploy mesa-pos (static) + mesa-api (Node) on CyberPanel.
# Does NOT deploy mesa-pos-website.
#
# Required env (adjust for your server):
#   export REPO_DIR="/home/restaurant-pos.isarva.in/Restaurant-POS"
#   export POS_PUBLIC_HTML="/home/app.restaurant-pos.isarva.in/public_html"
#   export VITE_API_URL="https://api.restaurant-pos.isarva.in"
#
# Optional:
#   export PM2_APP_NAME="mesa-api"
#   export SKIP_NPM_INSTALL=0
#
# Run after git pull (CyberPanel webhook or cron):
#   bash "$REPO_DIR/deploy/cyberpanel/deploy-apps.sh"

set -euo pipefail

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "$0")/../../" && pwd)}"
POS_PUBLIC_HTML="${POS_PUBLIC_HTML:-/home/app.restaurant-pos.isarva.in/public_html}"
PM2_APP_NAME="${PM2_APP_NAME:-mesa-api}"
SKIP_NPM_INSTALL="${SKIP_NPM_INSTALL:-0}"

POS_DIR="${REPO_DIR}/mesa-pos"
API_DIR="${REPO_DIR}/mesa-api"

if [[ ! -d "${POS_DIR}" || ! -d "${API_DIR}" ]]; then
  echo "ERROR: mesa-pos or mesa-api not found under REPO_DIR=${REPO_DIR}"
  exit 1
fi

if [[ -z "${VITE_API_URL:-}" ]]; then
  echo "WARN: VITE_API_URL is not set — mesa-pos build will use .env on server if present."
fi

install_deps() {
  local dir="$1"
  if [[ "${SKIP_NPM_INSTALL}" == "1" ]]; then
    return 0
  fi
  echo "→ npm ci in ${dir}"
  (cd "$dir" && npm ci)
}

echo "=== Deploy mesa-pos (POS app) ==="
install_deps "${POS_DIR}"

if [[ -n "${VITE_API_URL:-}" ]]; then
  export VITE_API_URL
fi

(cd "${POS_DIR}" && npm run build)

mkdir -p "${POS_PUBLIC_HTML}"
rsync -a --delete "${POS_DIR}/dist/" "${POS_PUBLIC_HTML}/"
echo "POS static files → ${POS_PUBLIC_HTML}"

echo "=== Deploy mesa-api (backend) ==="
install_deps "${API_DIR}"

if [[ ! -f "${API_DIR}/.env" ]]; then
  echo "ERROR: ${API_DIR}/.env missing. Copy from .env.example and configure DATABASE_URL, JWT_SECRET, etc."
  exit 1
fi

(cd "${API_DIR}" && npx prisma generate)
(cd "${API_DIR}" && npm run build)
(cd "${API_DIR}" && npx prisma migrate deploy)

if command -v pm2 >/dev/null 2>&1; then
  if pm2 describe "${PM2_APP_NAME}" >/dev/null 2>&1; then
    pm2 restart "${PM2_APP_NAME}" --update-env
  else
    (cd "${REPO_DIR}" && pm2 start deploy/cyberpanel/ecosystem.config.cjs --only "${PM2_APP_NAME}")
  fi
  pm2 save
  echo "mesa-api running under PM2 (${PM2_APP_NAME})"
else
  echo "WARN: pm2 not found. Start API manually: cd ${API_DIR} && npm run start"
fi

echo "Deploy complete."
echo "  POS: files in ${POS_PUBLIC_HTML}"
echo "  API: port from ${API_DIR}/.env (default 3001) — reverse-proxy to api subdomain"
