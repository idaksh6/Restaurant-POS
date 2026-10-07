#!/usr/bin/env python3
"""Probe ZATCA onboard routes on production API."""
from __future__ import annotations

import os
import sys

import paramiko

HOST = os.environ.get("MESA_SSH_HOST", "172.237.41.81")
USER = os.environ.get("MESA_SSH_USER", "root")
PASSWORD = os.environ.get("MESA_SSH_PASSWORD") or "Mahesh@india?"
REPO = "/home/restaurant-pos.isarva.in/Restaurant-POS"


def main() -> int:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, 22, USER, PASSWORD, allow_agent=False, look_for_keys=False)
    script = r"""
set -e
CTRL=$REPO/mesa-api/src/modules/zatca/zatca.controller.ts
DIST=$REPO/mesa-api/dist/modules/zatca/zatca.controller.js
REPO=/home/restaurant-pos.isarva.in/Restaurant-POS
echo "=== src routes"
grep -n "onboard\|Post\|Get\|Put" "$REPO/mesa-api/src/modules/zatca/zatca.controller.ts" | head -40
echo "=== dist exists?"
ls -la "$REPO/mesa-api/dist/modules/zatca/" 2>&1 | head -20
echo "=== dist onboard"
grep -n "onboard" "$REPO/mesa-api/dist/modules/zatca/zatca.controller.js" 2>&1 | head -20
echo "=== curl POST onboard/csr (no auth)"
curl -sk -w "\nHTTP:%{http_code}\n" -X POST "https://api.restaurant-pos.isarva.in/zatca/onboard/csr" -H "Content-Type: application/json" -d '{"otp":"123456"}' | head -c 500
echo
echo "=== curl GET config (no auth)"
curl -sk -w "\nHTTP:%{http_code}\n" "https://api.restaurant-pos.isarva.in/zatca/config" | head -c 300
echo
echo "=== curl POST compliance (no auth)"
curl -sk -w "\nHTTP:%{http_code}\n" -X POST "https://api.restaurant-pos.isarva.in/zatca/compliance" -H "Content-Type: application/json" -d '{}' | head -c 300
echo
echo "=== pm2 describe"
sudo -u resta6907 env PATH=/home/restaurant-pos.isarva.in/.nvm/versions/node/v20.20.2/bin:$PATH pm2 show mesa-api 2>/dev/null | head -30 || pm2 show mesa-api | head -30
"""
    _, stdout, stderr = client.exec_command(script, timeout=120)
    out = stdout.read().decode()
    err = stderr.read().decode()
    print(out)
    if err.strip():
        print(err, file=sys.stderr)
    client.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
