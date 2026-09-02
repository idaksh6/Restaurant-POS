#!/bin/bash
# Fix interrupted dpkg then install Docker (CyberPanel / Ubuntu-Debian).
# Run as root once via CyberPanel Terminal or Cron:
#   bash /home/fix-docker-install.sh
set -euo pipefail

log() { echo "[fix-docker] $*"; }

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root: sudo bash $0"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

log "Step 1/5 — repair interrupted dpkg..."
dpkg --configure -a || true
apt-get -f install -y
dpkg --configure -a

log "Step 2/5 — update package lists..."
apt-get update -y

log "Step 3/5 — install prerequisites..."
apt-get install -y ca-certificates curl gnupg lsb-release apt-transport-https

log "Step 4/5 — install Docker..."
if command -v docker >/dev/null 2>&1; then
  log "Docker already present: $(docker --version)"
else
  curl -fsSL https://get.docker.com | sh
fi

systemctl enable docker
systemctl start docker

log "Step 5/5 — verify..."
docker --version
docker run --rm hello-world

log "Done. Refresh CyberPanel → Docker Manager."
