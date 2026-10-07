#!/usr/bin/env python3
"""Publish the Isarva POS Print Agent installer to <POS docRoot>/downloads/."""
from __future__ import annotations

import sys
from pathlib import Path

import paramiko

sys.path.insert(0, str(Path(__file__).resolve().parent))
from upload_extra_charge_tax import HOST, PASSWORD, USER  # noqa: E402

DOCROOT = "/home/restaurant-pos.isarva.in/app.restaurant-pos.isarva.in"
NAME = "Isarva-Print-Agent-Setup.exe"
LOCAL = Path(__file__).resolve().parents[2] / "mesa-pos" / "release-agent" / NAME
URL = f"https://app.restaurant-pos.isarva.in/downloads/{NAME}"


def main() -> int:
    if not LOCAL.is_file():
        print(f"Missing installer: {LOCAL} (run `npm run agent:win` in mesa-pos)", file=sys.stderr)
        return 1

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, 22, USER, PASSWORD, allow_agent=False, look_for_keys=False)
    sftp = paramiko.SFTPClient.from_transport(
        client.get_transport(), window_size=64 * 1024 * 1024, max_packet_size=256 * 1024
    )
    try:
        sftp.mkdir(f"{DOCROOT}/downloads")
    except OSError:
        pass
    tmp = f"{DOCROOT}/downloads/.{NAME}.part"
    size = LOCAL.stat().st_size
    last = [-1]

    def progress(done: int, total: int) -> None:
        pct = done * 100 // max(total, 1)
        if pct // 10 != last[0]:
            last[0] = pct // 10
            print(f"  {pct}%", flush=True)

    sftp.put(str(LOCAL), tmp, callback=progress)
    sftp.close()

    script = (
        "set -e\n"
        f'mv -f "{tmp}" "{DOCROOT}/downloads/{NAME}"\n'
        f'chown -R resta6907:resta6907 "{DOCROOT}/downloads"\n'
        f'chmod 644 "{DOCROOT}/downloads/{NAME}"\n'
        f'stat -c "server size %s" "{DOCROOT}/downloads/{NAME}"\n'
        f'curl -skI "{URL}" | grep -iE "^(HTTP|content-type|content-length)"\n'
    )
    _, stdout, stderr = client.exec_command(script, timeout=120)
    out = stdout.read().decode(errors="replace")
    err = stderr.read().decode(errors="replace")
    code = stdout.channel.recv_exit_status()
    print(f"local size {size}")
    if out.strip():
        print(out.strip())
    if err.strip():
        print(err.strip(), file=sys.stderr)
    client.close()
    return code


if __name__ == "__main__":
    raise SystemExit(main())
