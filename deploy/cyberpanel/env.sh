#!/bin/bash
# Source before npm/pm2 in deploy scripts (non-login SSH / CI has no nvm in PATH).
NVM_DIR="${NVM_DIR:-/home/restaurant-pos.isarva.in/.nvm}"
if [[ -s "${NVM_DIR}/nvm.sh" ]]; then
  # shellcheck disable=SC1091
  source "${NVM_DIR}/nvm.sh"
  nvm use default >/dev/null 2>&1 || nvm use 20 >/dev/null 2>&1 || true
fi

# PM2 runs under the CyberPanel site user; CI often SSHs as root.
DEPLOY_SITE_USER="${DEPLOY_SITE_USER:-resta6907}"
run_pm2() {
  if [[ "$(id -un)" == "root" ]]; then
    sudo -u "${DEPLOY_SITE_USER}" env PATH="${PATH}" "$(command -v pm2)" "$@"
  else
    pm2 "$@"
  fi
}
