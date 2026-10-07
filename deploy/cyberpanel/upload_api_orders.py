#!/usr/bin/env python3
"""Upload orders.service.ts and rebuild mesa-api."""
from __future__ import annotations

import os
import sys
from pathlib import Path

import paramiko

HOST = os.environ.get("MESA_SSH_HOST", "172.237.41.81")
USER = os.environ.get("MESA_SSH_USER", "root")
PASSWORD = os.environ.get("MESA_SSH_PASSWORD") or "Mahesh@india?"
REPO = "/home/restaurant-pos.isarva.in/Restaurant-POS"
NODE = "/home/restaurant-pos.isarva.in/.nvm/versions/node/v20.20.2/bin"
LOCAL = (
    Path(__file__).resolve().parents[2]
    / "mesa-api"
    / "src"
    / "modules"
    / "orders"
    / "orders.service.ts"
)
REMOTE = f"{REPO}/mesa-api/src/modules/orders/orders.service.ts"


def main() -> int:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, 22, USER, PASSWORD, allow_agent=False, look_for_keys=False)
    sftp = client.open_sftp()
    sftp.put(str(LOCAL), REMOTE)
    sftp.close()
    print("uploaded orders.service.ts")

    script = f"""
set -e
export PATH={NODE}:/usr/bin:/bin
cd {REPO}/mesa-api
npm run build
sudo -u resta6907 env PATH={NODE}:$PATH pm2 restart mesa-api || env PATH={NODE}:$PATH pm2 restart mesa-api
sleep 3
curl -sk https://api.restaurant-pos.isarva.in/health
echo
"""
    _, stdout, stderr = client.exec_command(script, timeout=300)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if out.strip():
        print(out)
    if err.strip():
        print(err[-2000:], file=sys.stderr)
    client.close()
    return code


if __name__ == "__main__":
    raise SystemExit(main())
