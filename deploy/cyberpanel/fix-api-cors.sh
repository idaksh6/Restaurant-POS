#!/bin/bash
# Fix duplicate Access-Control-Allow-Origin on api vhost (CyberPanel OLS + NestJS).
# Run once on server as root.
#
# Optional: CORS_ORIGIN=https://app.restaurant-pos.isarva.in

set -euo pipefail

VHOST="/usr/local/lsws/conf/vhosts/api.restaurant-pos.isarva.in/vhost.conf"
API_ENV="/home/restaurant-pos.isarva.in/Restaurant-POS/mesa-api/.env"
ORIGIN="${CORS_ORIGIN:-https://app.restaurant-pos.isarva.in}"
NODE="/home/restaurant-pos.isarva.in/.nvm/versions/node/v20.20.2/bin"

if [[ ! -f "${VHOST}" ]]; then
  echo "ERROR: ${VHOST} not found"
  exit 1
fi

# Nest must not send CORS when LiteSpeed adds it (OLS duplicates otherwise).
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
  addDefaultCharset       off
  enableCORS              0
  extraHeaders            <<<END_extraHeaders
Access-Control-Allow-Origin {origin}
Access-Control-Allow-Methods GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD
Access-Control-Allow-Headers Content-Type, Authorization, X-Company-Id, X-Branch-Id
Access-Control-Max-Age 86400
END_extraHeaders
}}'''
updated, n = re.subn(r"context / \{.*?\}", block, conf, count=1, flags=re.DOTALL)
if n != 1:
    raise SystemExit("Could not update context / in vhost.conf")
vhost.write_text(updated)
print("Updated", vhost)
PY

/usr/local/lsws/bin/lswsctrl restart
sudo -u resta6907 env PATH="${NODE}:${PATH}" "${NODE}/pm2" restart mesa-api --update-env

echo "CORS fix applied for ${ORIGIN}"
curl -skI -H "Origin: ${ORIGIN}" "https://api.restaurant-pos.isarva.in/health" | grep -i access-control || true
