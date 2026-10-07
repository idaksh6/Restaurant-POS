#!/usr/bin/env python3
import os
import sys
import paramiko

HOST = os.environ.get("MESA_SSH_HOST", "172.237.41.81")
USER = os.environ.get("MESA_SSH_USER", "root")
PASSWORD = os.environ.get("MESA_SSH_PASSWORD") or "Mahesh@india?"
NODE = "/home/restaurant-pos.isarva.in/.nvm/versions/node/v20.20.2/bin"

script = f"""
export PATH={NODE}:$PATH
fuser -k 3001/tcp 2>/dev/null || true
sleep 2
ss -ltnp | grep 3001 || echo port_free
cd /home/restaurant-pos.isarva.in/Restaurant-POS/mesa-api
sudo -u resta6907 env PATH={NODE}:$PATH pm2 start mesa-api --update-env 2>/dev/null \\
  || sudo -u resta6907 env PATH={NODE}:$PATH pm2 restart mesa-api --update-env
sleep 4
sudo -u resta6907 env PATH={NODE}:$PATH pm2 list
echo '--- POST onboard/csr ---'
curl -sk -w '\\nHTTP:%{{http_code}}\\n' -X POST https://api.restaurant-pos.isarva.in/zatca/onboard/csr \\
  -H 'Content-Type: application/json' -d '{{}}' | head -c 400
echo
echo '--- health ---'
curl -sk https://api.restaurant-pos.isarva.in/health
echo
"""

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, 22, USER, PASSWORD, allow_agent=False, look_for_keys=False)
_, stdout, stderr = client.exec_command(script, timeout=90)
print(stdout.read().decode())
err = stderr.read().decode()
if err.strip():
    print(err, file=sys.stderr)
print("exit", stdout.channel.recv_exit_status())
client.close()
