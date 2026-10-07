#!/usr/bin/env python3
from __future__ import annotations

import os
import sys
import time

import paramiko

HOST = os.environ.get("MESA_SSH_HOST", "172.237.41.81")
USER = os.environ.get("MESA_SSH_USER", "root")
PASSWORD = os.environ.get("MESA_SSH_PASSWORD") or "Mahesh@india?"
NODE = "/home/restaurant-pos.isarva.in/.nvm/versions/node/v20.20.2/bin"

script = r"""
set -e
export PATH=%s:$PATH
export NVM_DIR=/home/restaurant-pos.isarva.in/.nvm
source "$NVM_DIR/nvm.sh" 2>/dev/null || true
cd /home/restaurant-pos.isarva.in/Restaurant-POS/mesa-api
node -e '
require("dotenv").config();
const {PrismaClient}=require("@prisma/client");
const p=new PrismaClient();
(async()=>{
  const rows=await p.tenantRegistry.findMany({select:{id:true,companyCode:true,taxId:true,companyName:true}});
  console.log(JSON.stringify(rows,null,2));
  await p.$disconnect();
})().catch(e=>{console.error(e);process.exit(1)});
'
echo '---'
npx prisma migrate status | tail -30
echo '---'
curl -sk https://api.restaurant-pos.isarva.in/health
echo
""" % NODE


def main() -> int:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, 22, USER, PASSWORD, allow_agent=False, look_for_keys=False)
    time.sleep(2)
    _, stdout, stderr = client.exec_command(script, timeout=120)
    out = stdout.read()
    err = stderr.read()
    code = stdout.channel.recv_exit_status()
    sys.stdout.buffer.write(out)
    if err.strip():
        sys.stderr.buffer.write(err[-3000:])
    client.close()
    return code


if __name__ == "__main__":
    raise SystemExit(main())
