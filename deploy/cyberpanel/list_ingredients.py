#!/usr/bin/env python3
"""List ingredient counts / sample rows on tenant DBs (read-only)."""
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
async function run(label, url) {
  const p = new PrismaClient({ datasources: { db: { url } } })
  try {
    const n = await p.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM "Ingredient"`)
    const rows = await p.$queryRawUnsafe(`SELECT id, name, sku, category, vendor FROM "Ingredient" ORDER BY name ASC LIMIT 25`)
    console.log(label, 'count', n[0]?.n)
    for (const r of rows) console.log(JSON.stringify(r))
  } catch (e) {
    console.log(label, 'ERR', e.message)
  }
  await p.$disconnect()
}
;(async () => {
  const control = new PrismaClient()
  const regs = await control.tenantRegistry.findMany().catch(() => [])
  for (const r of regs) await run(`TENANT:${r.id}`, r.databaseUrl || process.env.DATABASE_URL)
  await run('PRIMARY', process.env.DATABASE_URL)
  await control.$disconnect()
})().catch((e) => { console.error(e); process.exit(1) })
NODE
"""


def main() -> int:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, 22, USER, PASSWORD, allow_agent=False, look_for_keys=False)
    _, stdout, stderr = client.exec_command(REMOTE, timeout=120)
    sys.stdout.write(stdout.read().decode("utf-8", "replace"))
    err = stderr.read().decode("utf-8", "replace")
    if err.strip():
        sys.stderr.write(err[-1500:])
    code = stdout.channel.recv_exit_status()
    client.close()
    return code


if __name__ == "__main__":
    raise SystemExit(main())
