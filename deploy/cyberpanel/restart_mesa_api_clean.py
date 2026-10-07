#!/usr/bin/env python3
"""Kill stale mesa-api on :3001 and restart PM2 cleanly."""
from __future__ import annotations

import os
import sys

import paramiko

HOST = os.environ.get("MESA_SSH_HOST", "172.237.41.81")
USER = os.environ.get("MESA_SSH_USER", "root")
PASSWORD = os.environ.get("MESA_SSH_PASSWORD") or "Mahesh@india?"
NODE = "/home/restaurant-pos.isarva.in/.nvm/versions/node/v20.20.2/bin"
REPO = "/home/restaurant-pos.isarva.in/Restaurant-POS"


def main() -> int:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, 22, USER, PASSWORD, allow_agent=False, look_for_keys=False)
    script = f"""
set -e
export PATH={NODE}:$PATH
export NVM_DIR=/home/restaurant-pos.isarva.in/.nvm
source "$NVM_DIR/nvm.sh" 2>/dev/null || true
echo "=== who holds 3001"
ss -ltnp | grep 3001 || netstat -ltnp 2>/dev/null | grep 3001 || true
echo "=== pm2 stop"
sudo -u resta6907 env PATH={NODE}:$PATH pm2 stop mesa-api 2>/dev/null || env PATH={NODE}:$PATH pm2 stop mesa-api || true
sleep 1
echo "=== kill listeners on 3001"
fuser -k 3001/tcp 2>/dev/null || true
# also kill any node main.js for mesa-api
pkill -f "{REPO}/mesa-api/dist/main.js" 2>/dev/null || true
sleep 2
echo "=== after kill"
ss -ltnp | grep 3001 || echo "port 3001 free"
echo "=== pm2 start"
cd {REPO}/mesa-api
sudo -u resta6907 env PATH={NODE}:$PATH pm2 restart mesa-api --update-env 2>/dev/null || \\
  env PATH={NODE}:$PATH pm2 restart mesa-api --update-env
sleep 3
sudo -u resta6907 env PATH={NODE}:$PATH pm2 list || env PATH={NODE}:$PATH pm2 list
echo "=== probe POST onboard/csr"
curl -sk -w "\\nHTTP:%{{http_code}}\\n" -X POST "https://api.restaurant-pos.isarva.in/zatca/onboard/csr" \\
  -H "Content-Type: application/json" -d '{{"otp":"123456"}}' | head -c 400
echo
echo "=== probe GET config"
curl -sk -w "\\nHTTP:%{{http_code}}\\n" "https://api.restaurant-pos.isarva.in/zatca/config" | head -c 200
echo
echo "=== health"
curl -sk "https://api.restaurant-pos.isarva.in/health"
echo
"""
    _, stdout, stderr = client.exec_command(script, timeout=120)
    print(stdout.read().decode())
    err = stderr.read().decode()
    if err.strip():
        print(err, file=sys.stderr)
    code = stdout.channel.recv_exit_status()
    client.close()
    return code


if __name__ == "__main__":
    raise SystemExit(main())
