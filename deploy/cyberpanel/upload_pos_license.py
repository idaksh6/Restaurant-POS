#!/usr/bin/env python3
"""Upload POS license (TenantRegistry) changes, migrate, rebuild API, rebuild POS."""
from __future__ import annotations

import os
import sys
import tarfile
import io
from pathlib import Path

import paramiko

HOST = os.environ.get("MESA_SSH_HOST", "172.237.41.81")
USER = os.environ.get("MESA_SSH_USER", "root")
PASSWORD = os.environ.get("MESA_SSH_PASSWORD") or "Mahesh@india?"
REPO = "/home/restaurant-pos.isarva.in/Restaurant-POS"
NODE = "/home/restaurant-pos.isarva.in/.nvm/versions/node/v20.20.2/bin"
DOCROOT = "/home/restaurant-pos.isarva.in/app.restaurant-pos.isarva.in"
STAGE = "/home/restaurant-pos.isarva.in/pos-build-stage"
API_URL = os.environ.get("VITE_API_URL", "https://api.restaurant-pos.isarva.in")
ROOT = Path(__file__).resolve().parents[2]
MIG = "20260925100000_tenant_pos_license"

API_FILES = [
    (
        ROOT / "mesa-api/src/modules/auth/auth.service.ts",
        f"{REPO}/mesa-api/src/modules/auth/auth.service.ts",
    ),
    (
        ROOT / "mesa-api/src/modules/auth/license.ts",
        f"{REPO}/mesa-api/src/modules/auth/license.ts",
    ),
    (
        ROOT / "mesa-api/src/modules/dev/dev.service.ts",
        f"{REPO}/mesa-api/src/modules/dev/dev.service.ts",
    ),
    (
        ROOT / "mesa-api/src/modules/dev/dev.controller.ts",
        f"{REPO}/mesa-api/src/modules/dev/dev.controller.ts",
    ),
    (
        ROOT / "mesa-api/src/tenant/tenant-db.service.ts",
        f"{REPO}/mesa-api/src/tenant/tenant-db.service.ts",
    ),
    (
        ROOT / "mesa-api/prisma/schema.prisma",
        f"{REPO}/mesa-api/prisma/schema.prisma",
    ),
    (
        ROOT / f"mesa-api/prisma/migrations/{MIG}/migration.sql",
        f"{REPO}/mesa-api/prisma/migrations/{MIG}/migration.sql",
    ),
]

POS_INCLUDE = [
    "src",
    "public",
    "index.html",
    "package.json",
    "package-lock.json",
    "vite.config.ts",
    "tsconfig.json",
    "tsconfig.app.json",
    "tsconfig.node.json",
]


def make_pos_tarball() -> bytes:
    root = ROOT / "mesa-pos"
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for name in POS_INCLUDE:
            p = root / name
            if p.exists():
                tar.add(str(p), arcname=name)
    return buf.getvalue()


def main() -> int:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, 22, USER, PASSWORD, allow_agent=False, look_for_keys=False)
    sftp = client.open_sftp()
    try:
        sftp.mkdir(f"{REPO}/mesa-api/prisma/migrations/{MIG}")
    except OSError:
        pass
    for local, remote in API_FILES:
        sftp.put(str(local), remote)
        print(f"uploaded {local.name}")

    tarball = make_pos_tarball()
    with sftp.open("/tmp/pos-src.tgz", "wb") as fh:
        fh.write(tarball)
    print(f"uploaded POS tarball {len(tarball) / 1024:.0f} KB")
    sftp.close()

    script = f"""
set -e
export PATH={NODE}:/usr/bin:/bin
cd {REPO}/mesa-api
npx prisma generate
npx prisma migrate deploy || true
if [ -f scripts/migrate-all-tenants.js ]; then node scripts/migrate-all-tenants.js || true; fi
# License columns live on control TenantRegistry (primary DB) — also ensure tenants get schema
npm run build
sudo -u resta6907 env PATH={NODE}:$PATH pm2 restart mesa-api || env PATH={NODE}:$PATH pm2 restart mesa-api
sleep 2
curl -sk https://api.restaurant-pos.isarva.in/health
echo

rm -rf "{STAGE}" && mkdir -p "{STAGE}"
tar -xzf /tmp/pos-src.tgz -C "{STAGE}"
rm -f /tmp/pos-src.tgz
cd "{STAGE}"
npm ci --no-audit --no-fund --loglevel=error
VITE_API_URL="{API_URL}" npx vite build 2>&1 | tail -n 12
test -f dist/index.html
rsync -a --delete dist/ "{DOCROOT}/"
chown -R resta6907:resta6907 "{DOCROOT}"
echo "PUBLISHED $(grep -o 'index-[A-Za-z0-9_-]*\\.js' "{DOCROOT}/index.html" | head -n1)"
"""
    _, stdout, stderr = client.exec_command(script, timeout=600)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if out.strip():
        sys.stdout.buffer.write(out.encode("utf-8", "replace"))
        sys.stdout.buffer.write(b"\n")
    if err.strip():
        sys.stderr.buffer.write(err[-3000:].encode("utf-8", "replace"))
        sys.stderr.buffer.write(b"\n")
    client.close()
    return code


if __name__ == "__main__":
    raise SystemExit(main())
