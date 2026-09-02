#!/bin/bash
# Run inside CyberPanel → Websites → restaurant-pos.isarva.in → Advanced → SSH / Terminal
# One-time bootstrap + deploy (mesa-pos + mesa-api only).

set -euo pipefail

export REPO_DIR="${REPO_DIR:-/home/restaurant-pos.isarva.in/Restaurant-POS}"
export VITE_API_URL="${VITE_API_URL:-https://api.restaurant-pos.isarva.in}"
# POS_PUBLIC_HTML: leave unset — deploy-apps.sh reads the LiteSpeed vhost docRoot.

echo "=== Restaurant POS server bootstrap ==="
echo "REPO_DIR=${REPO_DIR}"
echo "POS_PUBLIC_HTML=${POS_PUBLIC_HTML:-<auto from vhost docRoot>}"

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js not found. Install Node 20+ in CyberPanel or via nvm, then re-run."
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  echo "ERROR: git not found."
  exit 1
fi

if ! command -v pm2 >/dev/null 2>&1; then
  echo "Installing PM2..."
  npm install -g pm2
fi

mkdir -p "$(dirname "${REPO_DIR}")"

if [[ ! -d "${REPO_DIR}/.git" ]]; then
  echo "Cloning repository..."
  git clone --branch main https://github.com/idaksh6/Restaurant-POS.git "${REPO_DIR}"
else
  echo "Pulling latest..."
  cd "${REPO_DIR}"
  git fetch origin main
  git reset --hard origin/main
fi

if [[ ! -f "${REPO_DIR}/mesa-api/.env" ]]; then
  echo "Creating mesa-api/.env from example — EDIT DATABASE_URL and secrets!"
  cp "${REPO_DIR}/mesa-api/.env.example" "${REPO_DIR}/mesa-api/.env"
fi

if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -qx mesa-postgres; then
  echo "NOTE: Local Postgres not detected. Run: bash ${REPO_DIR}/deploy/cyberpanel/install-postgres.sh"
fi

echo "VITE_API_URL=${VITE_API_URL}" > "${REPO_DIR}/mesa-pos/.env"

bash "${REPO_DIR}/deploy/cyberpanel/deploy-apps.sh"

echo "=== Done. Open app subdomain and verify API health on port 3001 ==="
