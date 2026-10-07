#!/usr/bin/env python3
"""Upload ExtraCharge taxIds schema + masters.service and migrate/rebuild mesa-api."""
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
MIG = "20260909180000_extra_charge_tax"


def put(sftp: paramiko.SFTPClient, local: Path, remote: str) -> None:
    sftp.put(str(local), remote)
    print(f"uploaded {local.name}")


def main() -> int:
    files = [
        (ROOT / "mesa-api/prisma/schema.prisma", f"{REPO}/mesa-api/prisma/schema.prisma"),
        (
            ROOT / f"mesa-api/prisma/migrations/{MIG}/migration.sql",
            f"{REPO}/mesa-api/prisma/migrations/{MIG}/migration.sql",
        ),
        (
            ROOT / "mesa-api/src/modules/masters/masters.service.ts",
            f"{REPO}/mesa-api/src/modules/masters/masters.service.ts",
        ),
    ]
    for local, _ in files:
        if not local.is_file():
            print(f"Missing file: {local}", file=sys.stderr)
            return 1

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, 22, USER, PASSWORD, allow_agent=False, look_for_keys=False)
    sftp = client.open_sftp()
    try:
        sftp.mkdir(f"{REPO}/mesa-api/prisma/migrations/{MIG}")
    except OSError:
        pass
    for local, remote in files:
        put(sftp, local, remote)
    sftp.close()

    script = (
        "set -e\n"
        f"export PATH={NODE}:$PATH\n"
        "export NVM_DIR=/home/restaurant-pos.isarva.in/.nvm\n"
        'source "$NVM_DIR/nvm.sh" 2>/dev/null || true\n'
        f"cd {REPO}/mesa-api\n"
        "npx prisma generate\n"
        "npx prisma migrate deploy || true\n"
        "if [ -f scripts/migrate-all-tenants.js ]; then node scripts/migrate-all-tenants.js || true; fi\n"
        "npm run build\n"
        f"cd {REPO}\n"
        f"sudo -u resta6907 env PATH={NODE}:$PATH pm2 restart mesa-api 2>/dev/null || "
        f"env PATH={NODE}:$PATH pm2 restart mesa-api\n"
        "curl -sk https://api.restaurant-pos.isarva.in/health\n"
    )
    _, stdout, stderr = client.exec_command(script, timeout=420)
    out = stdout.read().decode(errors="replace")
    err = stderr.read().decode(errors="replace")
    code = stdout.channel.recv_exit_status()
    safe = lambda s: s.encode("ascii", "replace").decode("ascii")
    if out.strip():
        print(safe(out))
    if err.strip():
        print(safe(err), file=sys.stderr)
    client.close()
    return code


if __name__ == "__main__":
    raise SystemExit(main())
