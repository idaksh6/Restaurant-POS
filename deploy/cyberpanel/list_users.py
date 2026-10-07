#!/usr/bin/env python3
"""List users across tenant DBs on CyberPanel (read-only)."""
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
  console.log('TENANTS', regs.length)
  for (const r of regs) {
    console.log('TENANT', r.id, r.companyName || '', r.databaseName || '')
    const url = r.databaseUrl || process.env.DATABASE_URL
    const p = new PrismaClient({ datasources: { db: { url } } })
    try {
      const users = await p.user.findMany({
        select: { id: true, username: true, name: true, role: true, branchId: true, companyId: true, active: true },
        orderBy: { username: 'asc' },
      })
      console.log('USERS', users.length)
      for (const u of users) console.log(JSON.stringify(u))
      const branches = await p.branch.findMany({
        select: { id: true, code: true, name: true, active: true },
      })
      console.log('BRANCHES', branches.length)
      for (const b of branches) console.log(JSON.stringify(b))
    } catch (e) {
      console.log('ERR', e.message)
    }
    await p.$disconnect()
  }
  try {
    const users = await control.user.findMany({
      select: { id: true, username: true, name: true, role: true, branchId: true, companyId: true, active: true },
      orderBy: { username: 'asc' },
    })
    console.log('PRIMARY_USERS', users.length)
    for (const u of users) console.log(JSON.stringify(u))
  } catch (e) {
    console.log('PRIMARY_ERR', e.message)
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
