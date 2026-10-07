#!/usr/bin/env python3
"""One-shot: ensure sync/masters API files built + PM2 restarted."""
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
ROOT = Path(__file__).resolve().parents[2]

FILES = [
    (
        ROOT / "mesa-api/src/modules/sync/sync.service.ts",
        f"{REPO}/mesa-api/src/modules/sync/sync.service.ts",
    ),
    (
        ROOT / "mesa-api/src/modules/masters/masters.service.ts",
        f"{REPO}/mesa-api/src/modules/masters/masters.service.ts",
    ),
]


def main() -> int:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, 22, USER, PASSWORD, allow_agent=False, look_for_keys=False)
    sftp = client.open_sftp()
    for local, remote in FILES:
        sftp.put(str(local), remote)
        print(f"uploaded {local.name}")
    sftp.close()

    script = f"""
set -e
export PATH={NODE}:$PATH
export NVM_DIR=/home/restaurant-pos.isarva.in/.nvm
source "$NVM_DIR/nvm.sh" 2>/dev/null || true
grep -n "ISO watermark" {REPO}/mesa-api/src/modules/sync/sync.service.ts
cd {REPO}/mesa-api
npm run build
cd {REPO}
sudo -u resta6907 env PATH={NODE}:$PATH pm2 restart mesa-api 2>/dev/null || env PATH={NODE}:$PATH pm2 restart mesa-api
curl -sk https://api.restaurant-pos.isarva.in/health
echo
"""
    _, stdout, stderr = client.exec_command(script, timeout=300)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    sys.stdout.buffer.write(out.encode("utf-8", "replace"))
    if err.strip():
        sys.stderr.buffer.write(err[-4000:].encode("utf-8", "replace"))
    client.close()
    return code


if __name__ == "__main__":
    raise SystemExit(main())
