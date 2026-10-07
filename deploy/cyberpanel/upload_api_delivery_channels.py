#!/usr/bin/env python3
"""Upload delivery channel API files and rebuild mesa-api on production."""
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
FILES = [
    (
        ROOT / "mesa-api/src/modules/delivery/delivery-channels.service.ts",
        f"{REPO}/mesa-api/src/modules/delivery/delivery-channels.service.ts",
    ),
    (
        ROOT / "mesa-api/src/modules/delivery/delivery-channels.controller.ts",
        f"{REPO}/mesa-api/src/modules/delivery/delivery-channels.controller.ts",
    ),
]


def main() -> int:
    for local, _ in FILES:
        if not local.is_file():
            print(f"Missing file: {local}", file=sys.stderr)
            return 1

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, 22, USER, PASSWORD, allow_agent=False, look_for_keys=False)

    sftp = client.open_sftp()
    for local, remote in FILES:
        sftp.put(str(local), remote)
        print(f"uploaded {local.name}")
    sftp.close()

    script = (
        "set -e\n"
        f"export PATH={NODE}:$PATH\n"
        "export NVM_DIR=/home/restaurant-pos.isarva.in/.nvm\n"
        'source "$NVM_DIR/nvm.sh" 2>/dev/null || true\n'
        f"cd {REPO}/mesa-api\n"
        "npm run build\n"
        f"cd {REPO}\n"
        f"sudo -u resta6907 env PATH={NODE}:$PATH pm2 restart mesa-api 2>/dev/null || "
        f"env PATH={NODE}:$PATH pm2 restart mesa-api\n"
        "curl -sk https://api.restaurant-pos.isarva.in/health\n"
    )
    _, stdout, stderr = client.exec_command(script, timeout=300)
    out = stdout.read().decode()
    err = stderr.read().decode()
    code = stdout.channel.recv_exit_status()
    if out.strip():
        sys.stdout.buffer.write(out.encode("utf-8", "replace"))
        sys.stdout.buffer.write(b"\n")
    if err.strip():
        sys.stderr.buffer.write(err.encode("utf-8", "replace"))
        sys.stderr.buffer.write(b"\n")
    client.close()
    return code


if __name__ == "__main__":
    raise SystemExit(main())
