#!/usr/bin/env bash
# =============================================================================
# Denjoy Platform — Update script (bestaande LXC installatie bijwerken)
# Gebruik: sudo bash update.sh
# =============================================================================
set -euo pipefail

PLATFORM_DIR="/var/www/mijn-website"
APP_USER="denjoy"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }

[ "$(id -u)" -eq 0 ] || { echo "Voer uit als root"; exit 1; }

log "Services stoppen..."
if command -v systemctl >/dev/null 2>&1; then
  systemctl stop denjoy-platform denjoy-upload 2>/dev/null || true
else
  warn "systemctl niet beschikbaar; services worden niet automatisch gestopt."
fi

log "Bestanden kopiëren naar ${PLATFORM_DIR}..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_DIR="$(dirname "${SCRIPT_DIR}")"

# Kopieer alles behalve storage (database/config bewaren)
rsync -av --exclude='backend-api/storage/' \
          --exclude='.git/' \
          --exclude='deploy/' \
          "${SRC_DIR}/" "${PLATFORM_DIR}/"

# Rechten herstellen
chown -R "${APP_USER}:${APP_USER}" \
  "${PLATFORM_DIR}/backend-api/storage" 2>/dev/null || true

# pip update
if [ -x "${PLATFORM_DIR}/.venv/bin/pip" ]; then
  "${PLATFORM_DIR}/.venv/bin/pip" install --quiet --upgrade flask flask-cors
else
  warn "Geen Python venv gevonden op ${PLATFORM_DIR}/.venv; pip-update wordt overgeslagen."
fi

log "Zero Trust backend-module controleren en indien nodig installeren..."
PS_UPDATE_LOG="/var/log/denjoy-psmodules-update.log"
nohup /usr/bin/pwsh -NonInteractive -NoProfile -File "${PLATFORM_DIR}/deploy/install-powershell-modules.ps1" > "${PS_UPDATE_LOG}" 2>&1 &
log "PowerShell module-update gestart op de achtergrond. Log: ${PS_UPDATE_LOG}"

log "Services herstarten..."
if command -v systemctl >/dev/null 2>&1; then
  systemctl start denjoy-platform
  systemctl status denjoy-platform --no-pager -l
else
  warn "systemctl niet beschikbaar; services worden niet automatisch herstart."
fi

log "Update voltooid."
