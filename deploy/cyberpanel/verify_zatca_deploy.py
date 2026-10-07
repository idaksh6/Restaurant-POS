#!/usr/bin/env python3
"""Verify ZATCA deploy: jsrsasign installed, fresh build, pm2 up, health OK."""
import os
import paramiko

HOST = os.environ.get("MESA_SSH_HOST", "172.237.41.81")
USER = os.environ.get("MESA_SSH_USER", "root")
PASSWORD = os.environ.get("MESA_SSH_PASSWORD") or "Mahesh@india?"
NODE = "/home/restaurant-pos.isarva.in/.nvm/versions/node/v20.20.2/bin"
REPO = "/home/restaurant-pos.isarva.in/Restaurant-POS"

SCRIPT = f"""
export PATH={NODE}:$PATH
cd {REPO}/mesa-api
[ -f node_modules/jsrsasign/package.json ] && echo JSRSASIGN_OK || echo JSRSASIGN_MISSING
stat -c '%y %n' dist/modules/zatca/zatca-crypto.js 2>/dev/null || echo DIST_MISSING
grep -c secp256k1 dist/modules/zatca/zatca-crypto.js 2>/dev/null || echo GREP_FAIL
sudo -u resta6907 env PATH={NODE}:$PATH pm2 ls 2>/dev/null | grep mesa-api || env PATH={NODE}:$PATH pm2 ls | grep mesa-api
curl -sk https://api.restaurant-pos.isarva.in/health
echo ""
"""


def main() -> int:
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, 22, USER, PASSWORD, allow_agent=False, look_for_keys=False)
    _, o, e = c.exec_command(SCRIPT, timeout=180)
    out = o.read().decode("utf-8", "replace")
    err = e.read().decode("utf-8", "replace").strip()
    print(out)
    if err:
        print("STDERR:", err[:800])
    c.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
