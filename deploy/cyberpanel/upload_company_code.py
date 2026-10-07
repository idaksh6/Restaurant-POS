#!/usr/bin/env python3
"""Upload company-code activation changes and migrate + rebuild mesa-api."""
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
    "mesa-api/prisma/schema.prisma",
    "mesa-api/prisma/migrations/20260908160000_tenant_company_code/migration.sql",
    "mesa-api/src/tenant/tenant-db.service.ts",
    "mesa-api/src/modules/auth/auth.service.ts",
    "mesa-api/src/modules/auth/auth.controller.ts",
    "mesa-api/src/modules/dev/dev.service.ts",
]


def ensure_dir(sftp: paramiko.SFTPClient, remote: str) -> None:
    parts = remote.strip("/").split("/")
    cur = ""
    for part in parts[:-1]:
        cur += "/" + part
        try:
            sftp.stat(cur)
        except FileNotFoundError:
            sftp.mkdir(cur)


def main() -> int:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, 22, USER, PASSWORD, allow_agent=False, look_for_keys=False)
    sftp = client.open_sftp()
    for rel in FILES:
        local = ROOT / rel
        remote = f"{REPO}/{rel}"
        if not local.is_file():
            print(f"Missing file: {local}", file=sys.stderr)
            return 1
        ensure_dir(sftp, remote)
        sftp.put(str(local), remote)
        print(f"uploaded {rel}")
    sftp.close()

    script = f"""
set -euo pipefail
export PATH={NODE}:$PATH
export NVM_DIR=/home/restaurant-pos.isarva.in/.nvm
source "$NVM_DIR/nvm.sh" 2>/dev/null || true
cd {REPO}/mesa-api
npx prisma generate
npx prisma migrate deploy
if [ -f scripts/migrate-all-tenants.js ]; then node scripts/migrate-all-tenants.js; fi
npm run build
cd {REPO}
sudo -u resta6907 env PATH={NODE}:$PATH pm2 restart mesa-api 2>/dev/null || env PATH={NODE}:$PATH pm2 restart mesa-api
curl -sk https://api.restaurant-pos.isarva.in/health
echo
"""
    _, stdout, stderr = client.exec_command(script, timeout=600)
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
