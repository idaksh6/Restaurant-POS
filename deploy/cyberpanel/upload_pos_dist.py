#!/usr/bin/env python3
"""Upload local mesa-pos/dist to production docRoot (no git pull)."""
from __future__ import annotations

import os
import sys
from pathlib import Path

import paramiko

HOST = os.environ.get("MESA_SSH_HOST", "172.237.41.81")
USER = os.environ.get("MESA_SSH_USER", "root")
PASSWORD = os.environ.get("MESA_SSH_PASSWORD") or "Mahesh@india?"
DOCROOT = "/home/restaurant-pos.isarva.in/app.restaurant-pos.isarva.in"
LOCAL = Path(__file__).resolve().parents[2] / "mesa-pos" / "dist"


def upload_dir(sftp: paramiko.SFTPClient, local: Path, remote: str) -> None:
    for path in local.iterdir():
        remote_path = f"{remote}/{path.name}"
        if path.is_dir():
            try:
                sftp.mkdir(remote_path)
            except OSError:
                pass
            upload_dir(sftp, path, remote_path)
        else:
            sftp.put(str(path), remote_path)
            print(f"uploaded {path.name}")


def main() -> int:
    if not LOCAL.is_dir():
        print(f"Missing build output: {LOCAL}", file=sys.stderr)
        return 1

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, 22, USER, PASSWORD, allow_agent=False, look_for_keys=False)

    _, stdout, _ = client.exec_command(
        f'find "{DOCROOT}" -mindepth 1 -maxdepth 1 ! -name downloads -exec rm -rf {{}} +'
    )
    stdout.channel.recv_exit_status()

    sftp = client.open_sftp()
    upload_dir(sftp, LOCAL, DOCROOT)
    sftp.close()

    _, stdout, stderr = client.exec_command(
        f'chown -R resta6907:resta6907 "{DOCROOT}" && '
        f'grep -o "index-[A-Za-z0-9_-]*\\.js" "{DOCROOT}/index.html"'
    )
    print(stdout.read().decode())
    err = stderr.read().decode()
    if err.strip():
        print(err, file=sys.stderr)

    client.close()
    print(f"POS -> {DOCROOT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
