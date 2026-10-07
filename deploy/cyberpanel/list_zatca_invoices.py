#!/usr/bin/env python3
"""List recent ZATCA invoice rows across tenant DBs (read-only)."""
from __future__ import annotations

import os
import sys

import paramiko

HOST = os.environ.get("MESA_SSH_HOST", "172.237.41.81")
USER = os.environ.get("MESA_SSH_USER", "root")
PASSWORD = os.environ.get("MESA_SSH_PASSWORD") or "Mahesh@india?"

REMOTE = r"""
set -euo pipefail
ENVF=/home/restaurant-pos.isarva.in/Restaurant-POS/mesa-api/.env
if [ -f "$ENVF" ]; then set -a; . "$ENVF"; set +a; fi
export PATH=/home/restaurant-pos.isarva.in/.nvm/versions/node/v20.20.2/bin:$PATH
cd /home/restaurant-pos.isarva.in/Restaurant-POS/mesa-api
node <<'NODE'
const { PrismaClient } = require('@prisma/client')
;(async () => {
  const control = new PrismaClient()
  const regs = await control.tenantRegistry.findMany().catch(() => [])
  for (const r of regs) {
    console.log('TENANT', r.id, r.companyName || '')
    const url = r.databaseUrl || process.env.DATABASE_URL
    const p = new PrismaClient({ datasources: { db: { url } } })
    try {
      const rows = await p.$queryRawUnsafe(
        `SELECT id, status, "totalSar", "vatSar", "invoiceHash" IS NOT NULL AS hashed,
                "qrPhase2Base64" IS NOT NULL AS qr2, LEFT(message, 400) AS message, "updatedAt"
         FROM "ZatcaInvoice" ORDER BY "updatedAt" DESC LIMIT 8`,
      )
      for (const row of rows) console.log(JSON.stringify(row))
      const co = await p.$queryRawUnsafe(
        `SELECT "zatcaPhase2Env", "zatcaCsidKind", "zatcaIcv", LEFT("zatcaPih", 12) AS pih,
                "zatcaBinaryToken" IS NOT NULL AS tok, "zatcaSecret" IS NOT NULL AS sec
         FROM "Company" LIMIT 3`,
      )
      for (const row of co) console.log('COMPANY', JSON.stringify(row))
    } catch (e) {
      console.log('ERR', e.message)
    }
    await p.$disconnect()
  }
  await control.$disconnect()
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
NODE
"""


def main() -> int:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, 22, USER, PASSWORD, allow_agent=False, look_for_keys=False)
    _, stdout, stderr = client.exec_command(REMOTE, timeout=180)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    sys.stdout.write(out)
    if err.strip():
        sys.stderr.write(err[-3000:])
    client.close()
    return code


if __name__ == "__main__":
    raise SystemExit(main())
