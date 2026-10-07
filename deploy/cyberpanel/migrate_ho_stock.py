#!/usr/bin/env python3
"""Move Head Office / unscoped stock onto the restaurant branch (tenant DBs)."""
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

function isHo(b) {
  const code = String(b.code || '').trim().toUpperCase()
  const name = String(b.name || '').trim().toLowerCase()
  return (
    code === 'H001' ||
    code === 'HO' ||
    code === 'HQ' ||
    code === 'HEAD' ||
    name.includes('head office') ||
    name.includes('headoffice')
  )
}

async function migrateDb(label, url) {
  const p = new PrismaClient({ datasources: { db: { url } } })
  try {
    const branches = await p.branch.findMany({ select: { id: true, code: true, name: true } })
    const ho = branches.filter(isHo)
    const stores = branches.filter((b) => !isHo(b))
    const target = stores.find((b) => String(b.code || '').toUpperCase().includes('RYD')) || stores[0]
    console.log(label, 'branches', branches.length, 'ho', ho.map((b) => b.code).join(','), 'target', target?.code || 'none')
    if (!target) {
      console.log(label, 'SKIP no restaurant branch')
      return
    }
    const hoIds = ho.map((b) => b.id)
    const before = await p.$queryRaw`
      SELECT "branchId", COUNT(*)::int AS n FROM "StockItem" GROUP BY "branchId"
    `
    console.log(label, 'stock_by_branch_before', JSON.stringify(before))

    if (hoIds.length) {
      const moved = await p.$executeRawUnsafe(
        `UPDATE "StockItem" SET "branchId" = $1
         WHERE "branchId" IS NULL OR "branchId" = ANY($2::text[])`,
        target.id,
        hoIds,
      )
      console.log(label, 'moved_rows', moved)
    } else {
      const moved = await p.$executeRawUnsafe(
        `UPDATE "StockItem" SET "branchId" = $1 WHERE "branchId" IS NULL`,
        target.id,
      )
      console.log(label, 'moved_null_rows', moved)
    }

    const after = await p.$queryRaw`
      SELECT "branchId", COUNT(*)::int AS n FROM "StockItem" GROUP BY "branchId"
    `
    console.log(label, 'stock_by_branch_after', JSON.stringify(after))
  } catch (e) {
    console.log(label, 'ERR', e.message)
  } finally {
    await p.$disconnect()
  }
}

;(async () => {
  const control = new PrismaClient()
  const regs = await control.tenantRegistry.findMany().catch(() => [])
  for (const r of regs) {
    const url = r.databaseUrl || process.env.DATABASE_URL
    await migrateDb(`TENANT:${r.id}`, url)
  }
  await migrateDb('PRIMARY', process.env.DATABASE_URL)
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
