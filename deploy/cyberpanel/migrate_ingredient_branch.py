#!/usr/bin/env python3
"""Scope ingredients by branch: delete seed rows; stamp remaining to Head Office."""
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
  return code === 'H001' || code === 'HO' || code === 'HQ' || name.includes('head office')
}

async function migrate(label, url) {
  const p = new PrismaClient({ datasources: { db: { url } } })
  try {
    await p.$executeRawUnsafe(`ALTER TABLE "Ingredient" ADD COLUMN IF NOT EXISTS "branchId" TEXT`)
    await p.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "Ingredient_companyId_branchId_idx" ON "Ingredient" ("companyId", "branchId")`,
    )
    const branches = await p.branch.findMany({ select: { id: true, code: true, name: true } })
    const ho = branches.find(isHo)
    const ryd = branches.find((b) => String(b.code || '').toUpperCase().includes('RYD')) || branches.find((b) => !isHo(b))
    console.log(label, 'ho', ho?.id, ho?.code, 'ryd', ryd?.id, ryd?.code)

    const del = await p.$executeRawUnsafe(`
      DELETE FROM "Ingredient"
      WHERE id ~ '^s[0-9]+$'
         OR sku IN (
           'MEAT-RIB-300','MEAT-CHK-BR','DRY-ARB-1','PRD-TOM','DRY-BUR','BEV-LEM','BEV-ESP',
           'DRY-CHO','DRY-OIL','SEA-BAS','DAIR-MILK','DRY-FLR','PRD-POT-RAW','PRD-POT-FRY',
           'DRY-PAN-BLK','DRY-PAN-CKB'
         )
    `)
    console.log(label, 'seed_deleted', del)

    // User-created leftovers without branch → Head Office (where they were added)
    if (ho?.id) {
      const stamped = await p.$executeRawUnsafe(
        `UPDATE "Ingredient" SET "branchId" = $1 WHERE "branchId" IS NULL OR "branchId" = ''`,
        ho.id,
      )
      console.log(label, 'stamped_null_to_ho', stamped)
    }

    const left = await p.$queryRawUnsafe(`SELECT id, name, sku, "branchId" FROM "Ingredient" ORDER BY name`)
    console.log(label, 'remaining', left.length)
    for (const r of left) console.log(JSON.stringify(r))
  } catch (e) {
    console.log(label, 'ERR', e.message)
  }
  await p.$disconnect()
}

;(async () => {
  const control = new PrismaClient()
  const regs = await control.tenantRegistry.findMany().catch(() => [])
  for (const r of regs) await migrate(`TENANT:${r.id}`, r.databaseUrl || process.env.DATABASE_URL)
  await migrate('PRIMARY', process.env.DATABASE_URL)
  await control.$disconnect()
})().catch((e) => { console.error(e); process.exit(1) })
NODE
"""


def main() -> int:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, 22, USER, PASSWORD, allow_agent=False, look_for_keys=False)
    _, stdout, stderr = client.exec_command(REMOTE, timeout=180)
    sys.stdout.write(stdout.read().decode("utf-8", "replace"))
    err = stderr.read().decode("utf-8", "replace")
    if err.strip():
        sys.stderr.write(err[-2000:])
    code = stdout.channel.recv_exit_status()
    client.close()
    return code


if __name__ == "__main__":
    raise SystemExit(main())
