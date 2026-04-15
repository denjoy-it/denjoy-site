#!/usr/bin/env bash
# =============================================================================
# Denjoy Platform — Start script (lokaal / ontwikkeling)
# Gebruik: bash start.sh [--host 0.0.0.0] [--port 8787]
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="${SCRIPT_DIR}/backend-api"
VENV_DIR="${SCRIPT_DIR}/.venv"

HOST="${M365_LOCAL_WEBAPP_HOST:-127.0.0.1}"
PORT="${M365_LOCAL_WEBAPP_PORT:-8787}"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --host) HOST="$2"; shift 2 ;;
        --port) PORT="$2"; shift 2 ;;
        *) echo "Onbekende optie: $1"; exit 1 ;;
    esac
done

# Python resolver: venv > system
if [[ -x "${VENV_DIR}/bin/python3" ]]; then
    PYTHON="${VENV_DIR}/bin/python3"
    PIP="${VENV_DIR}/bin/pip"
elif [[ -x "${VENV_DIR}/bin/python" ]]; then
    PYTHON="${VENV_DIR}/bin/python"
    PIP="${VENV_DIR}/bin/pip"
else
    PYTHON="$(command -v python3 || command -v python)"
    PIP="$(command -v pip3 || command -v pip)"
fi

# Venv aanmaken als het niet bestaat
if [[ ! -x "${VENV_DIR}/bin/python3" && ! -x "${VENV_DIR}/bin/python" ]]; then
    echo "[*] Virtual environment aanmaken in ${VENV_DIR}..."
    python3 -m venv "${VENV_DIR}"
    PYTHON="${VENV_DIR}/bin/python3"
    PIP="${VENV_DIR}/bin/pip"
fi

# Dependencies installeren
if [[ -f "${SCRIPT_DIR}/requirements.txt" ]]; then
    "${PIP:-pip}" install --quiet -r "${SCRIPT_DIR}/requirements.txt" 2>/dev/null || true
fi

echo "╔══════════════════════════════════════════════╗"
echo "║       Denjoy Platform — Starting...         ║"
echo "╠══════════════════════════════════════════════╣"
echo "║  Platform : ${SCRIPT_DIR}"
echo "║  Python   : ${PYTHON}"
echo "║  URL      : http://${HOST}:${PORT}"
echo "╚══════════════════════════════════════════════╝"
echo ""

cd "${BACKEND_DIR}"
exec "${PYTHON}" app.py
