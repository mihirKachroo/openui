#!/bin/bash
export PATH="/home/mkachroo/local/bin:$PATH"
export PORT="${OPENUI_PORT:-44101}"
export LAUNCH_CWD="${LAUNCH_CWD:-$(pwd)}"

HOSTNAME=$(hostname)
echo "========================================="
echo " OpenUI — AI Agent Command Center"
echo "========================================="
echo ""
echo " VPNless:    http://${HOSTNAME}.fbinfra.net:${PORT}"
echo " SSH tunnel: ssh -L ${PORT}:localhost:${PORT} ${HOSTNAME}"
echo "             then http://localhost:${PORT}"
echo ""
echo " Bun $(bun --version) | Port ${PORT}"
echo "========================================="
echo ""

cd /home/mkachroo/openui
exec bun run server/index.ts
