#!/bin/bash
# Re-issue production Let's Encrypt certs (CyberPanel acme.sh was using staging CA).
set -euo pipefail

ACME="/root/.acme.sh/acme.sh"
WEBROOT="/usr/local/lsws/Example/html"
DOMAINS=(
  api.restaurant-pos.isarva.in
  app.restaurant-pos.isarva.in
)

"$ACME" --set-default-ca --server letsencrypt

for domain in "${DOMAINS[@]}"; do
  echo "=== Issuing production cert for ${domain} ==="
  "$ACME" --issue -d "${domain}" -w "${WEBROOT}" --force --server letsencrypt
  "$ACME" --install-cert -d "${domain}" \
    --cert-file "/etc/letsencrypt/live/${domain}/cert.pem" \
    --key-file "/etc/letsencrypt/live/${domain}/privkey.pem" \
    --fullchain-file "/etc/letsencrypt/live/${domain}/fullchain.pem" \
    --reloadcmd "/usr/local/lsws/bin/lswsctrl reload"
  openssl x509 -in "/etc/letsencrypt/live/${domain}/fullchain.pem" -noout -issuer
done

/usr/local/lsws/bin/lswsctrl restart
echo "Done."
