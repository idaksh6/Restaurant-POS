#!/bin/bash
# Build and deploy mesa-pos (static) + mesa-api (Node) on CyberPanel.
# Does NOT deploy mesa-pos-website.
#
# Required env (adjust for your server):
#   export REPO_DIR="/home/restaurant-pos.isarva.in/Restaurant-POS"
#   export VITE_API_URL="https://api.restaurant-pos.isarva.in"
#   # POS_PUBLIC_HTML is auto-detected from the LiteSpeed vhost docRoot; override only if needed:
#   export POS_PUBLIC_HTML="/home/restaurant-pos.isarva.in/app.restaurant-pos.isarva.in"
#
# Optional:
#   export PM2_APP_NAME="mesa-api"
#   export SKIP_NPM_INSTALL=0
#
# Run after git pull (CyberPanel webhook or cron):
#   bash "$REPO_DIR/deploy/cyberpanel/deploy-apps.sh"

set -euo pipefail

# shellcheck disable=SC1091
source "$(dirname "$0")/env.sh"

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "$0")/../../" && pwd)}"
POS_DOMAIN="${POS_DOMAIN:-app.restaurant-pos.isarva.in}"

# CyberPanel child domains live under the parent site, e.g.
# /home/restaurant-pos.isarva.in/app.restaurant-pos.isarva.in — never guess;
# read the docRoot LiteSpeed actually serves.
detect_docroot() {
  local conf="/usr/local/lsws/conf/vhosts/${POS_DOMAIN}/vhost.conf"
  if [[ -r "${conf}" ]]; then
    awk '$1=="docRoot"{print $2; exit}' "${conf}"
  fi
}
POS_PUBLIC_HTML="${POS_PUBLIC_HTML:-$(detect_docroot)}"
POS_PUBLIC_HTML="${POS_PUBLIC_HTML:-/home/${POS_DOMAIN}/public_html}"
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
site_owner="$(stat -c '%U:%G' "$(dirname "${POS_PUBLIC_HTML}")" 2>/dev/null || true)"
rsync -a --delete "${POS_DIR}/dist/" "${POS_PUBLIC_HTML}/"
if [[ -n "${site_owner}" && "$(id -un)" == "root" ]]; then
  chown -R "${site_owner}" "${POS_PUBLIC_HTML}"
fi
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
if [[ -f "${API_DIR}/scripts/migrate-all-tenants.js" ]]; then
  (cd "${API_DIR}" && node scripts/migrate-all-tenants.js)
fi

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
echo "  POS: files in ${POS_PUBLIC_HTML}"
echo "  API: port from ${API_DIR}/.env (default 3001) — reverse-proxy to api subdomain"
