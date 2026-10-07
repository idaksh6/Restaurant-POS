#!/usr/bin/env python3
"""Compare the ZATCA CSID certificate's VAT with the company VAT and last invoice (read-only).
Prints only public certificate data — never the private key or secret."""
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
const { X509Certificate } = require('crypto')
;(async () => {
  const control = new PrismaClient()
  const regs = await control.tenantRegistry.findMany().catch(() => [])
  for (const r of regs) {
    console.log('TENANT', r.id)
    const p = new PrismaClient({ datasources: { db: { url: r.databaseUrl || process.env.DATABASE_URL } } })
    try {
      const co = await p.$queryRawUnsafe(
        `SELECT id, "companyName", "taxId", "zatcaCsid", "zatcaCsidKind", "zatcaPhase2Env" FROM "Company" LIMIT 3`,
      )
      for (const c of co) {
        console.log('COMPANY', JSON.stringify({ id: c.id, name: c.companyName, taxId: c.taxId, kind: c.zatcaCsidKind, env: c.zatcaPhase2Env }))
        const pem = String(c.zatcaCsid || '')
        console.log('CSID_HEAD', pem.slice(0, 40).replace(/\n/g, '\\n'), 'len', pem.length)
        try {
          const x = new X509Certificate(pem)
          console.log('CERT_SUBJECT', x.subject.replace(/\n/g, ' | '))
          console.log('CERT_ISSUER', x.issuer.replace(/\n/g, ' | '))
          console.log('CERT_SERIAL_HEX', x.serialNumber)
          console.log('CERT_SAN', String(x.subjectAltName || '').slice(0, 400))
          console.log('CERT_VALID', x.validFrom, '->', x.validTo)
          console.log('CERT_PEM_B64', x.raw.toString('base64'))
        } catch (e) {
          console.log('CERT_PARSE_ERR', e.message)
        }
      }
      const rows = await p.$queryRawUnsafe(
        `SELECT id, status, "sellerVat", "sellerName", "zatcaUuid" FROM "ZatcaInvoice" ORDER BY "updatedAt" DESC LIMIT 2`,
      )
      for (const row of rows) console.log('INVOICE', JSON.stringify(row))
    } catch (e) {
      console.log('ERR', e.message)
    }
    await p.$disconnect()
  }
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
        sys.stderr.write(err[-3000:])
    client.close()
    return code


if __name__ == "__main__":
    raise SystemExit(main())
