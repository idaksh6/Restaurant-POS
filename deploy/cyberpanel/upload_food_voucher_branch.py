#!/usr/bin/env python3
"""Upload food-voucher branch scoping (API) and rebuild."""
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
        ROOT / "mesa-api/src/modules/masters/masters.service.ts",
        f"{REPO}/mesa-api/src/modules/masters/masters.service.ts",
    ),
    (
        ROOT / "mesa-api/src/modules/masters/masters.controller.ts",
        f"{REPO}/mesa-api/src/modules/masters/masters.controller.ts",
    ),
    (
        ROOT / "mesa-api/prisma/schema.prisma",
        f"{REPO}/mesa-api/prisma/schema.prisma",
    ),
    (
        ROOT / "mesa-api/prisma/migrations/20260907100000_food_voucher_branch/migration.sql",
        f"{REPO}/mesa-api/prisma/migrations/20260907100000_food_voucher_branch/migration.sql",
    ),
]


def main() -> int:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, 22, USER, PASSWORD, allow_agent=False, look_for_keys=False)
    sftp = client.open_sftp()
    try:
        sftp.mkdir(f"{REPO}/mesa-api/prisma/migrations/20260907100000_food_voucher_branch")
    except OSError:
        pass
    for local, remote in FILES:
        sftp.put(str(local), remote)
        print(f"uploaded {local.name}")
    sftp.close()

    script = "\n".join(
        [
            "set -e",
            f"export PATH={NODE}:$PATH",
            "export NVM_DIR=/home/restaurant-pos.isarva.in/.nvm",
            'source "$NVM_DIR/nvm.sh" 2>/dev/null || true',
            f"cd {REPO}/mesa-api",
            "npx prisma generate",
            "npx prisma migrate deploy || true",
            "if [ -f scripts/migrate-all-tenants.js ]; then node scripts/migrate-all-tenants.js || true; fi",
            "npm run build",
            f"cd {REPO}",
            f"sudo -u resta6907 env PATH={NODE}:$PATH pm2 restart mesa-api 2>/dev/null || "
            f"env PATH={NODE}:$PATH pm2 restart mesa-api",
            "sleep 2",
            "curl -sk https://api.restaurant-pos.isarva.in/health",
        ]
    )
    _, stdout, stderr = client.exec_command(script, timeout=600)
    out = stdout.read().decode()
    err = stderr.read().decode()
    code = stdout.channel.recv_exit_status()
    if out.strip():
        print(out)
    if err.strip():
        print(err, file=sys.stderr)
    client.close()
    return code


if __name__ == "__main__":
    raise SystemExit(main())
