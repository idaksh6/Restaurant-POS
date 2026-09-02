#!/bin/bash
# CyberPanel OpenLiteSpeed duplicates Access-Control-Allow-Origin when Nest also
# sets it. Fix: LiteSpeed owns CORS headers; Nest answers OPTIONS with empty 204.
#
# Run once on server as root.
# Optional: CORS_ORIGIN=*  (default) — required for Electron mesa:// and the web app
#            CORS_ORIGIN=https://app.restaurant-pos.isarva.in  — web only

set -euo pipefail

VHOST="/usr/local/lsws/conf/vhosts/api.restaurant-pos.isarva.in/vhost.conf"
API_ENV="/home/restaurant-pos.isarva.in/Restaurant-POS/mesa-api/.env"
REPO_DIR="${REPO_DIR:-/home/restaurant-pos.isarva.in/Restaurant-POS}"
ORIGIN="${CORS_ORIGIN:-*}"
NODE="/home/restaurant-pos.isarva.in/.nvm/versions/node/v20.20.2/bin"

if [[ ! -f "${VHOST}" ]]; then
  echo "ERROR: ${VHOST} not found"
  exit 1
fi

if grep -q '^CORS_IN_APP=' "${API_ENV}" 2>/dev/null; then
  sed -i 's/^CORS_IN_APP=.*/CORS_IN_APP=0/' "${API_ENV}"
else
  echo 'CORS_IN_APP=0' >> "${API_ENV}"
fi

python3 <<PY
import re
from pathlib import Path
origin = "${ORIGIN}"
vhost = Path("${VHOST}")
conf = vhost.read_text()
block = f'''context / {{
  type                    proxy
  handler                 mesaapi
  enableWebSocket         1
  addDefaultCharset       off
  enableCORS              0
  extraHeaders            <<<END_extraHeaders
Access-Control-Allow-Origin {origin}
Access-Control-Allow-Methods GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD
Access-Control-Allow-Headers Content-Type, Authorization, X-Company-Id, X-Branch-Id, X-Device-Id
Access-Control-Max-Age 86400
END_extraHeaders
}}'''
updated, n = re.subn(r"context / \{.*?\}", block, conf, count=1, flags=re.DOTALL)
if n != 1:
    raise SystemExit("Could not update context / in vhost.conf")
vhost.write_text(updated)
print("Updated", vhost)
PY

# Pull latest main.ts fix if repo is a git checkout, then rebuild API so OPTIONS 204 is live.
if [[ -d "${REPO_DIR}/.git" ]]; then
  git config --global --add safe.directory "${REPO_DIR}" 2>/dev/null || true
  (cd "${REPO_DIR}" && git fetch -q origin main && git reset -q --hard origin/main) || true
fi

export PATH="${NODE}:${PATH}"
(cd "${REPO_DIR}/mesa-api" && npm run build)

/usr/local/lsws/bin/lswsctrl restart
# Re-read ecosystem env (CORS_IN_APP) — plain restart keeps stale PM2 env.
sudo -u resta6907 env PATH="${NODE}:${PATH}" "${NODE}/pm2" delete mesa-api >/dev/null 2>&1 || true
(cd "${REPO_DIR}" && sudo -u resta6907 env PATH="${NODE}:${PATH}" "${NODE}/pm2" start deploy/cyberpanel/ecosystem.config.cjs --only mesa-api)
sudo -u resta6907 env PATH="${NODE}:${PATH}" "${NODE}/pm2" save

echo "Waiting for API..."
for i in 1 2 3 4 5 6 7 8 9 10; do
  code="$(curl -sk -o /dev/null -w '%{http_code}' http://127.0.0.1:3001/health || true)"
  [[ "${code}" == "200" ]] && break
  sleep 1
done

echo "=== Nest OPTIONS (should be 204, NO Access-Control) ==="
curl -s -D - -o /dev/null -X OPTIONS "http://127.0.0.1:3001/dev/login" \
  -H "Origin: ${ORIGIN}" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type" | grep -iE 'HTTP/|access-control' || true

echo "=== HTTPS OPTIONS (should be 204, single Access-Control-Allow-Origin) ==="
curl -sk -D - -o /dev/null -X OPTIONS "https://api.restaurant-pos.isarva.in/dev/login" \
  -H "Origin: ${ORIGIN}" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type" | grep -iE 'HTTP/|access-control' || true

echo "=== HTTPS GET /health ==="
curl -sk -D - -o /dev/null "https://api.restaurant-pos.isarva.in/health" \
  -H "Origin: ${ORIGIN}" | grep -iE 'HTTP/|access-control' || true
