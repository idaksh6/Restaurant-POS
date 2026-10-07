#!/usr/bin/env python3
"""Upload ZATCA module + prisma bits and rebuild mesa-api on production."""
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
        ROOT / "mesa-api" / "src" / "modules" / "zatca" / "zatca-proxy.client.ts",
        f"{REPO}/mesa-api/src/modules/zatca/zatca-proxy.client.ts",
    ),
    (
        ROOT / "mesa-api" / "src" / "modules" / "zatca" / "fatoora.client.ts",
        f"{REPO}/mesa-api/src/modules/zatca/fatoora.client.ts",
    ),
    (
        ROOT / "mesa-api" / "src" / "modules" / "zatca" / "zatca-crypto.ts",
        f"{REPO}/mesa-api/src/modules/zatca/zatca-crypto.ts",
    ),
    (
        ROOT / "mesa-api" / "src" / "modules" / "zatca" / "zatca.service.ts",
        f"{REPO}/mesa-api/src/modules/zatca/zatca.service.ts",
    ),
    (
        ROOT / "mesa-api" / "src" / "modules" / "zatca" / "zatca.controller.ts",
        f"{REPO}/mesa-api/src/modules/zatca/zatca.controller.ts",
    ),
    (
        ROOT / "mesa-api" / "src" / "types" / "shims.d.ts",
        f"{REPO}/mesa-api/src/types/shims.d.ts",
    ),
    (
        ROOT / "mesa-api" / "package.json",
        f"{REPO}/mesa-api/package.json",
    ),
    (
        ROOT / "mesa-api" / "package-lock.json",
        f"{REPO}/mesa-api/package-lock.json",
    ),
    (
        ROOT / "mesa-api" / "prisma" / "schema.prisma",
        f"{REPO}/mesa-api/prisma/schema.prisma",
    ),
    (
        ROOT
        / "mesa-api"
        / "prisma"
        / "migrations"
        / "20260909153000_zatca_qr_phase2"
        / "migration.sql",
        f"{REPO}/mesa-api/prisma/migrations/20260909153000_zatca_qr_phase2/migration.sql",
    ),
    (
        ROOT
        / "mesa-api"
        / "prisma"
        / "migrations"
        / "20260909160000_zatca_fatoora_direct"
        / "migration.sql",
        f"{REPO}/mesa-api/prisma/migrations/20260909160000_zatca_fatoora_direct/migration.sql",
    ),
]


def main() -> int:
    for local, _ in FILES:
        if not local.is_file():
            print(f"Missing file: {local}", file=sys.stderr)
            return 1

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, 22, USER, PASSWORD, allow_agent=False, look_for_keys=False)

    sftp = client.open_sftp()
    for path in (
        f"{REPO}/mesa-api/src/types",
        f"{REPO}/mesa-api/src/modules/zatca",
        f"{REPO}/mesa-api/prisma/migrations/20260909153000_zatca_qr_phase2",
        f"{REPO}/mesa-api/prisma/migrations/20260909160000_zatca_fatoora_direct",
    ):
        try:
            sftp.stat(path)
        except OSError:
            stdin, stdout, stderr = client.exec_command(f"mkdir -p {path}")
            stdout.channel.recv_exit_status()
    for local, remote in FILES:
        sftp.put(str(local), remote)
        print(f"uploaded {local.name}")
    sftp.close()

    script = (
        "set -e\n"
        f"export PATH={NODE}:$PATH\n"
        "export NVM_DIR=/home/restaurant-pos.isarva.in/.nvm\n"
        'source "$NVM_DIR/nvm.sh" 2>/dev/null || true\n'
        f"cd {REPO}/mesa-api\n"
        "npm install\n"
        "npx prisma migrate deploy || true\n"
        "node scripts/migrate-all-tenants.js 2>/dev/null || true\n"
        "npm run build\n"
        f"cd {REPO}\n"
        f"sudo -u resta6907 env PATH={NODE}:$PATH pm2 restart mesa-api 2>/dev/null || "
        f"env PATH={NODE}:$PATH pm2 restart mesa-api\n"
        "curl -sk https://api.restaurant-pos.isarva.in/health\n"
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
