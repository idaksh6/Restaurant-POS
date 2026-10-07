#!/usr/bin/env python3
"""Upload only mesa-api zatca.service.ts, rebuild and restart mesa-api on production."""
from __future__ import annotations

import sys
from pathlib import Path

import paramiko

sys.path.insert(0, str(Path(__file__).resolve().parent))
from upload_extra_charge_tax import HOST, NODE, PASSWORD, REPO, USER  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
LOCAL = ROOT / "mesa-api" / "src" / "modules" / "zatca" / "zatca.service.ts"
REMOTE = f"{REPO}/mesa-api/src/modules/zatca/zatca.service.ts"


def main() -> int:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, 22, USER, PASSWORD, allow_agent=False, look_for_keys=False)
    sftp = client.open_sftp()
    sftp.put(str(LOCAL), REMOTE)
    sftp.close()
    print(f"uploaded {LOCAL.name}")

    script = (
        "set -e\n"
        f"export PATH={NODE}:$PATH\n"
        f"cd {REPO}/mesa-api\n"
        "npm run build 2>&1 | tail -5\n"
        f"sudo -u resta6907 env PATH={NODE}:$PATH pm2 restart mesa-api >/dev/null 2>&1 || "
        f"env PATH={NODE}:$PATH pm2 restart mesa-api >/dev/null\n"
        "sleep 4\n"
        "curl -sk https://api.restaurant-pos.isarva.in/health\n"
    )
    _, stdout, stderr = client.exec_command(script, timeout=600)
    out = stdout.read().decode(errors="replace")
    err = stderr.read().decode(errors="replace")
    code = stdout.channel.recv_exit_status()
    if out.strip():
        print(out.strip())
    if err.strip():
        print(err.strip(), file=sys.stderr)
    client.close()
    return code


if __name__ == "__main__":
    raise SystemExit(main())
