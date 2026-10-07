#!/usr/bin/env python3
"""Upload SalesLedger.invoiceUuid column + orders.service, migrate all tenants, rebuild API."""
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
MIG = "20260917160000_sales_ledger_invoice_uuid"

FILES = [
    (
        ROOT / "mesa-api/src/modules/orders/orders.service.ts",
        f"{REPO}/mesa-api/src/modules/orders/orders.service.ts",
    ),
    (
        ROOT / "mesa-api/prisma/schema.prisma",
        f"{REPO}/mesa-api/prisma/schema.prisma",
    ),
    (
        ROOT / f"mesa-api/prisma/migrations/{MIG}/migration.sql",
        f"{REPO}/mesa-api/prisma/migrations/{MIG}/migration.sql",
    ),
]


def main() -> int:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, 22, USER, PASSWORD, allow_agent=False, look_for_keys=False)
    sftp = client.open_sftp()
    try:
        sftp.mkdir(f"{REPO}/mesa-api/prisma/migrations/{MIG}")
    except OSError:
        pass
    for local, remote in FILES:
        sftp.put(str(local), remote)
        print(f"uploaded {local.name}")
    sftp.close()

    script = f"""
set -e
export PATH={NODE}:/usr/bin:/bin
cd {REPO}/mesa-api
npx prisma generate
npx prisma migrate deploy || true
if [ -f scripts/migrate-all-tenants.js ]; then node scripts/migrate-all-tenants.js || true; fi
npm run build
sudo -u resta6907 env PATH={NODE}:$PATH pm2 restart mesa-api || env PATH={NODE}:$PATH pm2 restart mesa-api
sleep 3
curl -sk https://api.restaurant-pos.isarva.in/health
echo
"""
    _, stdout, stderr = client.exec_command(script, timeout=600)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if out.strip():
        print(out)
    if err.strip():
        print(err[-3000:], file=sys.stderr)
    client.close()
    return code


if __name__ == "__main__":
    raise SystemExit(main())
