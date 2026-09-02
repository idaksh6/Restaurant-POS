#!/bin/bash
# Install Node.js 20 via nvm (no root/sudo needed). Run once via CyberPanel Cron.
LOG="/home/restaurant-pos.isarva.in/install-node.log"
echo "=== install-node started $(date) ===" >> "$LOG"

export NVM_DIR="/home/restaurant-pos.isarva.in/.nvm"
mkdir -p "$NVM_DIR"

if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
  echo "Downloading nvm..." >> "$LOG"
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | NVM_DIR="$NVM_DIR" bash >> "$LOG" 2>&1
fi

# shellcheck disable=SC1091
source "$NVM_DIR/nvm.sh"

if ! nvm ls 20 >/dev/null 2>&1; then
  echo "Installing Node 20..." >> "$LOG"
  nvm install 20 >> "$LOG" 2>&1
fi

nvm alias default 20 >> "$LOG" 2>&1
echo "node: $(node -v 2>>"$LOG")" >> "$LOG"
echo "npm: $(npm -v 2>>"$LOG")" >> "$LOG"
echo "=== install-node finished $(date) ===" >> "$LOG"
