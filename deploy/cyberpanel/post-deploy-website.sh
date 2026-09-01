#!/bin/bash
# Deploy mesa-pos-website to CyberPanel public_html after git pull.
#
# Usage (on server, after repo is cloned):
#   export CYBERPANEL_SITE_USER="restaurant-pos.isarva.in"
#   bash deploy/cyberpanel/post-deploy-website.sh
#
# Or set REPO_DIR and PUBLIC_HTML explicitly:
#   export REPO_DIR="/home/restaurant-pos.isarva.in/Restaurant-POS"
#   export PUBLIC_HTML="/home/restaurant-pos.isarva.in/public_html"
#   bash "$REPO_DIR/deploy/cyberpanel/post-deploy-website.sh"

set -euo pipefail

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "$0")/../../" && pwd)}"
CYBERPANEL_SITE_USER="${CYBERPANEL_SITE_USER:-restaurant-pos.isarva.in}"
PUBLIC_HTML="${PUBLIC_HTML:-/home/${CYBERPANEL_SITE_USER}/public_html}"
SOURCE="${REPO_DIR}/mesa-pos-website"

if [[ ! -f "${SOURCE}/index.html" ]]; then
  echo "ERROR: ${SOURCE}/index.html not found. Is REPO_DIR correct? (${REPO_DIR})"
  exit 1
fi

mkdir -p "${PUBLIC_HTML}"

rsync -a --delete \
  --exclude '.git' \
  --exclude '.gitignore' \
  "${SOURCE}/" "${PUBLIC_HTML}/"

echo "Deployed mesa-pos-website → ${PUBLIC_HTML}"
echo "Site: https://${CYBERPANEL_SITE_USER}/"
