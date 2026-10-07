#!/usr/bin/env python3
"""Delete seeded demo vendors + demo stock SKUs from tenant DBs."""
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
const SEED_VENDORS = ['vnd-meat','vnd-seafood','vnd-dairy','vnd-produce','vnd-bev','vnd-dry','vnd-general','sup-1','sup-2','sup-3']
const SEED_SKUS = ['MEAT-RIB-300','MEAT-CHK-BR','DRY-ARB-1','PRD-TOM','DRY-BUR','BEV-LEM','BEV-ESP','DRY-CHO','DRY-OIL','SEA-BAS','DAIR-MILK','DRY-FLR']

async function clear(label, url) {
  const p = new PrismaClient({ datasources: { db: { url } } })
  try {
    const v = await p.vendor.deleteMany({ where: { id: { in: SEED_VENDORS } } })
    console.log(label, 'vendors_deleted', v.count)
  } catch (e) {
    console.log(label, 'vendor_err', e.message)
  }
  try {
    const rows = await p.$queryRawUnsafe(
      `SELECT id FROM "StockItem"
       WHERE id ~ '(^|:)s([1-9]|1[0-2])$'
          OR sku = ANY($1::text[])`,
      SEED_SKUS,
    )
    const ids = (rows || []).map((r) => r.id)
    if (ids.length) {
      const s = await p.$executeRawUnsafe(
        `DELETE FROM "StockItem" WHERE id = ANY($1::text[])`,
        ids,
      )
      console.log(label, 'stock_deleted', s, 'ids', ids.length)
    } else {
      console.log(label, 'stock_deleted', 0)
    }
  } catch (e) {
    console.log(label, 'stock_err', e.message)
  }
  await p.$disconnect()
}

;(async () => {
  const control = new PrismaClient()
  const regs = await control.tenantRegistry.findMany().catch(() => [])
  for (const r of regs) {
    await clear(`TENANT:${r.id}`, r.databaseUrl || process.env.DATABASE_URL)
  }
  await clear('PRIMARY', process.env.DATABASE_URL)
  await control.$disconnect()
})().catch((e) => { console.error(e); process.exit(1) })
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
        sys.stderr.write(err[-2000:])
    client.close()
    return code


if __name__ == "__main__":
    raise SystemExit(main())
