#!/usr/bin/env python3
"""Build mesa-pos ON THE SERVER from the local working tree, then publish to the vhost docRoot.

Use when the local machine cannot run the bundler (e.g. Windows App Control blocking
rolldown's native binding). Uploads a tarball of the local source (no node_modules /
dist / docs), runs `npm ci` + `vite build` on the server, rsyncs dist/ to DOCROOT.
"""
from __future__ import annotations

import io
import os
import sys
import tarfile
from pathlib import Path

import paramiko

HOST = os.environ.get("MESA_SSH_HOST", "172.237.41.81")
USER = os.environ.get("MESA_SSH_USER", "root")
PASSWORD = os.environ.get("MESA_SSH_PASSWORD") or "Mahesh@india?"
DOCROOT = "/home/restaurant-pos.isarva.in/app.restaurant-pos.isarva.in"
STAGE = "/home/restaurant-pos.isarva.in/pos-build-stage"
NODE = "/home/restaurant-pos.isarva.in/.nvm/versions/node/v20.20.2/bin"
API_URL = os.environ.get("VITE_API_URL", "https://api.restaurant-pos.isarva.in")

ROOT = Path(__file__).resolve().parents[2] / "mesa-pos"
INCLUDE = [
    "src",
    "public",
    "index.html",
    "package.json",
    "package-lock.json",
    "vite.config.ts",
    "vite-plugins",
    "tsconfig.json",
    "tsconfig.app.json",
    "tsconfig.node.json",
]

REMOTE = f"""
set -euo pipefail
export PATH={NODE}:$PATH
rm -rf "{STAGE}" && mkdir -p "{STAGE}"
tar -xzf /tmp/pos-src.tgz -C "{STAGE}"
rm -f /tmp/pos-src.tgz
cd "{STAGE}"
echo "node $(node -v) · npm $(npm -v)"
npm ci --no-audit --no-fund --loglevel=error
VITE_API_URL="{API_URL}" npx vite build 2>&1 | tail -n 12
test -f dist/index.html
rsync -a --delete --exclude downloads/ dist/ "{DOCROOT}/"
chown -R resta6907:resta6907 "{DOCROOT}"
echo "PUBLISHED $(grep -o 'index-[A-Za-z0-9_-]*\\.js' "{DOCROOT}/index.html" | head -n1)"
"""


def make_tarball() -> bytes:
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for name in INCLUDE:
            p = ROOT / name
            if not p.exists():
                print(f"skip missing {name}")
                continue
            tar.add(str(p), arcname=name)
    return buf.getvalue()


def main() -> int:
    data = make_tarball()
    print(f"source tarball {len(data) / 1024:.0f} KB")

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, 22, USER, PASSWORD, allow_agent=False, look_for_keys=False)

    sftp = client.open_sftp()
    with sftp.open("/tmp/pos-src.tgz", "wb") as fh:
        fh.write(data)
    sftp.close()
    print("uploaded")

    _, stdout, stderr = client.exec_command(REMOTE, timeout=900)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    sys.stdout.buffer.write(out.encode("utf-8", "replace"))
    sys.stdout.buffer.write(b"\n")
    if err.strip():
        sys.stderr.buffer.write(err[-3000:].encode("utf-8", "replace"))
        sys.stderr.buffer.write(b"\n")
    client.close()
    return code


if __name__ == "__main__":
    raise SystemExit(main())
