#!/usr/bin/env python3
"""Deploy Restaurant-POS to CyberPanel over SSH (root).

Usage:
  python deploy/cyberpanel/ssh_deploy.py
  python deploy/cyberpanel/ssh_deploy.py --api-only
  python deploy/cyberpanel/ssh_deploy.py --pos-only

Env:
  MESA_SSH_PASSWORD  (fallback: project default — rotate regularly)
  MESA_SSH_HOST      default 172.237.41.81
  MESA_SSH_USER      default root
  MESA_SSH_PORT      default 22
"""
from __future__ import annotations

import argparse
import os
import sys

try:
    import paramiko
except ImportError:
    print("Install paramiko: pip install paramiko", file=sys.stderr)
    sys.exit(1)

HOST = os.environ.get("MESA_SSH_HOST", "172.237.41.81")
USER = os.environ.get("MESA_SSH_USER", "root")
PORT = int(os.environ.get("MESA_SSH_PORT", "22"))
PASSWORD = os.environ.get("MESA_SSH_PASSWORD") or "Mahesh@india?"
NODE = "/home/restaurant-pos.isarva.in/.nvm/versions/node/v20.20.2/bin"
REPO = "/home/restaurant-pos.isarva.in/Restaurant-POS"


def run(client: paramiko.SSHClient, script: str, timeout: int = 600) -> int:
    _, stdout, stderr = client.exec_command(script, timeout=timeout)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    sys.stdout.write(out.encode("ascii", "replace").decode("ascii"))
    if err.strip():
        sys.stderr.write(err[-4000:].encode("ascii", "replace").decode("ascii"))
    return code


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--api-only", action="store_true")
    ap.add_argument("--pos-only", action="store_true")
    args = ap.parse_args()

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, PORT, USER, PASSWORD, allow_agent=False, look_for_keys=False)

    pull = f"""
set -euo pipefail
export PATH={NODE}:$PATH
export NVM_DIR=/home/restaurant-pos.isarva.in/.nvm
# shellcheck disable=SC1091
source "$NVM_DIR/nvm.sh" 2>/dev/null || true
export REPO_DIR={REPO}
export VITE_API_URL=https://api.restaurant-pos.isarva.in
git config --global --add safe.directory "{REPO}" 2>/dev/null || true
cd "{REPO}"
git fetch -q origin main
git reset -q --hard origin/main
git log -1 --oneline
"""

    if args.api_only:
        body = """
bash deploy/cyberpanel/deploy-api-only.sh
"""
    elif args.pos_only:
        body = """
# POS only: build + rsync to vhost docRoot (same logic as deploy-apps.sh)
source deploy/cyberpanel/env.sh
POS_DOMAIN=app.restaurant-pos.isarva.in
DOCROOT="$(awk '$1=="docRoot"{print $2; exit}' /usr/local/lsws/conf/vhosts/${POS_DOMAIN}/vhost.conf)"
cd mesa-pos
npm ci --prefer-offline 2>/dev/null || npm install
npm run build
OWNER="$(stat -c '%U:%G' "$(dirname "$DOCROOT")")"
rsync -a --delete dist/ "$DOCROOT"/
chown -R "$OWNER" "$DOCROOT"
echo "POS → $DOCROOT"
grep -o 'index-[A-Za-z0-9_-]*\\.js' "$DOCROOT/index.html"
"""
    else:
        body = """
bash deploy/cyberpanel/deploy-apps.sh
"""

    code = run(client, pull + body)
    client.close()
    return code


if __name__ == "__main__":
    raise SystemExit(main())
