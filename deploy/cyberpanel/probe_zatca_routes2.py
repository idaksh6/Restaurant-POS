#!/usr/bin/env python3
import os, paramiko
HOST=os.environ.get("MESA_SSH_HOST","172.237.41.81")
USER=os.environ.get("MESA_SSH_USER","root")
PASSWORD=os.environ.get("MESA_SSH_PASSWORD") or "Mahesh@india?"
c=paramiko.SSHClient(); c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST,22,USER,PASSWORD,allow_agent=False,look_for_keys=False)
script=r'''
echo "=== PUT config"
curl -sk -w "\nHTTP:%{http_code}\n" -X PUT "https://api.restaurant-pos.isarva.in/zatca/config" -H "Content-Type: application/json" -d "{}" | head -c 200
echo
echo "=== PUT invoices"
curl -sk -w "\nHTTP:%{http_code}\n" -X PUT "https://api.restaurant-pos.isarva.in/zatca/invoices" -H "Content-Type: application/json" -d "{}" | head -c 200
echo
echo "=== POST masters something"
curl -sk -w "\nHTTP:%{http_code}\n" -X POST "https://api.restaurant-pos.isarva.in/health" | head -c 200
echo
echo "=== OPTIONS onboard"
curl -sk -w "\nHTTP:%{http_code}\n" -X OPTIONS "https://api.restaurant-pos.isarva.in/zatca/onboard/csr" -H "Origin: https://app.restaurant-pos.isarva.in" -H "Access-Control-Request-Method: POST" | head -c 400
echo
echo "=== dist Post metadata dump"
node -e "const m=require('/home/restaurant-pos.isarva.in/Restaurant-POS/mesa-api/dist/modules/zatca/zatca.controller.js'); console.log(Object.getOwnPropertyNames(m.ZatcaController.prototype))"
echo "=== error log"
tail -40 /home/restaurant-pos.isarva.in/.pm2/logs/mesa-api-error-0.log 2>/dev/null || true
echo "=== out log"
tail -20 /home/restaurant-pos.isarva.in/.pm2/logs/mesa-api-out-0.log 2>/dev/null || true
'''
_,o,e=c.exec_command(script,timeout=60)
print(o.read().decode())
print(e.read().decode())
c.close()
