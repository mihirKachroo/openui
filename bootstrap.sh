#!/usr/bin/env bash
#
# OpenUI — one-shot bootstrap + launcher for Meta devservers.
#
# Brings OpenUI up from nothing: installs Bun, clones the repo, installs deps,
# builds the client, and starts the server. Safe to re-run — finished steps are
# skipped, so the same command also works as a plain "start / restart".
#
# Quick start (you already have the repo):
#     ./bootstrap.sh
#
# Quick start (fresh machine, nothing installed) — run in an INTERACTIVE shell
# (GitHub egress is blocked from tool sandboxes):
#     bash -c "$(curl -fsSL --proxy http://fwdproxy:8080 \
#       https://raw.githubusercontent.com/mihirKachroo/openui/main/bootstrap.sh)"
#
# Easiest — ONE command, run on your LAPTOP:
#     ./bootstrap.sh --connect <devserver>
# It starts OpenUI on the devserver, tunnels it to http://localhost:PORT, and
# opens it — no browser warning, terminals work. (A tunnel is required: the
# no-tunnel VPNLess proxies drop WebSocket upgrades, which the terminals need.)
#
# Manual equivalent: ssh -L PORT:localhost:PORT <devserver>, then open
# http://localhost:PORT. No-tunnel http://<host>.fbinfra.net:PORT also loads,
# but Chrome shows "Not secure" and the terminal WebSockets may not survive.
#
# Options:
#     --setup-only   Install + build but don't start the server
#     --rebuild      Force a fresh client build
#     --fg           Run the server in the foreground (Ctrl-C to stop)
#     --stop         Stop any running OpenUI server and exit
#     --force        Allow restart even from inside an OpenUI-hosted terminal
#     --connect HOST Laptop mode: start OpenUI on HOST + tunnel + open browser
#     -h, --help     Show this help
#
# Env overrides:
#     OPENUI_PORT    Port to serve on (use 44100-44109 for VPNLess) (default 44101)
#     OPENUI_DIR     Where the repo lives        (default ~/openui)
#     OPENUI_REPO    Git URL to clone            (default the mihirKachroo fork)
#     OPENUI_LOG     Background log file          (default /tmp/openui.log)
#     BUN_DIR        Where to install Bun         (default ~/local/bin)
#
set -euo pipefail

# ---- config ----------------------------------------------------------------
# Meta network: GitHub + bun.sh are blocked, but npm + GitHub are reachable
# through fwdproxy. Respect anything already exported.
export https_proxy="${https_proxy:-http://fwdproxy:8080}"
export http_proxy="${http_proxy:-http://fwdproxy:8080}"

OPENUI_PORT="${OPENUI_PORT:-44101}"
OPENUI_REPO="${OPENUI_REPO:-https://github.com/mihirKachroo/openui.git}"
OPENUI_LOG="${OPENUI_LOG:-/tmp/openui.log}"
BUN_DIR="${BUN_DIR:-$HOME/local/bin}"
# Host CPU has AVX2 → non-baseline build. Override with -baseline on older CPUs.
BUN_PKG="${BUN_PKG:-@oven/bun-linux-x64}"

# Use the checkout this script lives in when there is one; otherwise default.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/server/index.ts" ]; then
  OPENUI_DIR="${OPENUI_DIR:-$SCRIPT_DIR}"
else
  OPENUI_DIR="${OPENUI_DIR:-$HOME/openui}"
fi

SETUP_ONLY=0; REBUILD=0; FOREGROUND=0; STOP_ONLY=0; FORCE=0; CONNECT_HOST=""
usage() { sed -n '2,/^set -euo/p' "$0" | sed 's/^# \{0,1\}//; s/^set -euo.*//'; }
while [ $# -gt 0 ]; do
  case "$1" in
    --setup-only) SETUP_ONLY=1 ;;
    --rebuild)    REBUILD=1 ;;
    --fg|--foreground) FOREGROUND=1 ;;
    --stop)       STOP_ONLY=1 ;;
    --force)      FORCE=1 ;;
    --connect)    shift; CONNECT_HOST="${1:-}"; [ -n "$CONNECT_HOST" ] || { echo "--connect needs a devserver host" >&2; exit 2; } ;;
    -h|--help)    usage; exit 0 ;;
    *) echo "unknown option: $1 (try --help)" >&2; exit 2 ;;
  esac
  shift
done

c_info=$'\033[1;36m'; c_warn=$'\033[1;33m'; c_err=$'\033[1;31m'; c_off=$'\033[0m'
log()  { printf '%s==>%s %s\n' "$c_info" "$c_off" "$*"; }
warn() { printf '%s!!%s  %s\n'  "$c_warn" "$c_off" "$*" >&2; }
die()  { printf '%sxx%s  %s\n'  "$c_err"  "$c_off" "$*" >&2; exit 1; }

# True when this very shell is a descendant of the OpenUI server, i.e. the
# terminal is hosted by OpenUI — restarting would kill this session.
running_under_openui() {
  local p="$PPID"
  while [ -n "$p" ] && [ "$p" -gt 1 ]; do
    if tr '\0' ' ' < "/proc/$p/cmdline" 2>/dev/null | grep -q 'server/index\.ts'; then
      return 0
    fi
    p="$(ps -o ppid= -p "$p" 2>/dev/null | tr -d ' ')"
  done
  return 1
}

stop_server() {
  if running_under_openui && [ "$FORCE" != 1 ]; then
    die "This terminal is hosted by the OpenUI server you'd restart — that would kill this session. Run from a plain SSH shell, or pass --force to override."
  fi
  pkill -f 'bun.*server/index.ts' 2>/dev/null && log "Stopped running server" || true
}

if [ "$STOP_ONLY" = 1 ]; then stop_server; exit 0; fi

# ---- Laptop mode: --connect <devserver> ------------------------------------
# Run on your LAPTOP: starts OpenUI on the devserver AND tunnels it to localhost
# in one shot, then opens the browser. A tunnel is required — Chrome trusts
# localhost (no warning) and, more importantly, the terminal WebSockets only
# work over a direct tunnel (the VPNLess proxies drop ws upgrades).
if [ -n "$CONNECT_HOST" ]; then
  unset https_proxy http_proxy 2>/dev/null || true   # laptop has no fwdproxy
  remote="${OPENUI_REMOTE:-\$HOME/fbsource/users/mk/mkachroo/openui/bootstrap.sh}"
  url="http://localhost:${OPENUI_PORT}"
  log "Starting OpenUI on ${CONNECT_HOST}; opening ${url} when ready (Ctrl-C stops both)"
  ( for _ in $(seq 1 180); do
      curl -fsS -o /dev/null "$url" 2>/dev/null && { (open "$url" 2>/dev/null || xdg-open "$url" 2>/dev/null) || true; break; }
      sleep 2
    done ) &
  exec ssh -t -L "${OPENUI_PORT}:localhost:${OPENUI_PORT}" "$CONNECT_HOST" "$remote --fg"
fi

# ---- 1. Bun ----------------------------------------------------------------
export PATH="$BUN_DIR:$PATH"
if ! command -v bun >/dev/null 2>&1; then
  log "Installing Bun from npm (bun.sh is blocked) → $BUN_DIR/bun"
  command -v python3 >/dev/null || die "python3 is required to resolve the Bun tarball"
  mkdir -p "$BUN_DIR"
  tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
  tarball="$(curl -fsSL "https://registry.npmjs.org/$BUN_PKG/latest" \
    | python3 -c 'import sys,json; print(json.load(sys.stdin)["dist"]["tarball"])')"
  curl -fsSL -o "$tmp/bun.tgz" "$tarball"
  tar xzf "$tmp/bun.tgz" -C "$tmp"
  install -m 0755 "$tmp/package/bin/bun" "$BUN_DIR/bun"
  rm -rf "$tmp"; trap - EXIT
fi
log "Bun $(bun --version)"

# ---- 2. Clone --------------------------------------------------------------
if [ ! -d "$OPENUI_DIR/.git" ]; then
  log "Cloning OpenUI → $OPENUI_DIR"
  git clone "$OPENUI_REPO" "$OPENUI_DIR" || die \
    "Clone failed. GitHub is blocked from tool sandboxes — run this in an interactive shell."
fi
cd "$OPENUI_DIR"

# ---- 3. Dependencies -------------------------------------------------------
[ -d node_modules ]        || { log "Installing root deps";   bun install; }
[ -d client/node_modules ] || { log "Installing client deps"; (cd client && bun install); }

# ---- 4. Build client -------------------------------------------------------
# `bun run build` -> `tsc && vite build`, and system node (v16) breaks Vite 5
# (crypto.getRandomValues). Run Vite under Bun's own runtime instead.
if [ "$REBUILD" = 1 ] || [ ! -f client/dist/index.html ]; then
  log "Building client (Vite under Bun)"
  (cd client && bun --bun node_modules/vite/bin/vite.js build)
fi

if [ "$SETUP_ONLY" = 1 ]; then
  log "Setup complete. Start later with:  OPENUI_PORT=$OPENUI_PORT $0"
  exit 0
fi

# ---- 5. Start --------------------------------------------------------------
# Serve plain HTTP. View it via --connect / an ssh -L tunnel (http://localhost,
# no warning) or the VPNLess URL (http://<host>.fbinfra.net, shown "Not secure").
stop_server
export PORT="$OPENUI_PORT"
export LAUNCH_CWD="${LAUNCH_CWD:-$OPENUI_DIR}"
host="$(hostname -f)"
vpnless="${host%.facebook.com}.fbinfra.net"   # strip .facebook.com, don't append it

echo
echo "========================================="
echo " OpenUI — AI Agent Command Center"
echo "========================================="
echo " No warning (recommended) — run on your laptop:"
echo "   ssh -L ${OPENUI_PORT}:localhost:${OPENUI_PORT} ${host}"
echo "   then open  http://localhost:${OPENUI_PORT}   (Chrome trusts localhost)"
echo " No tunnel:  http://${vpnless}:${OPENUI_PORT}   (loads, but \"Not secure\" + terminals may drop)"
echo " Bun $(bun --version) | HTTP :${OPENUI_PORT}"
echo "========================================="
echo

if [ "$FOREGROUND" = 1 ]; then
  exec bun run server/index.ts
fi

nohup bun run server/index.ts >"$OPENUI_LOG" 2>&1 &
srv_pid=$!
disown "$srv_pid" 2>/dev/null || true

# Give it a moment, then confirm it's actually serving.
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS -o /dev/null "http://localhost:${OPENUI_PORT}/" 2>/dev/null; then
    log "OpenUI is up (pid $srv_pid). Logs: $OPENUI_LOG"
    log "Stop with:  $0 --stop"
    exit 0
  fi
  kill -0 "$srv_pid" 2>/dev/null || die "Server exited early — see $OPENUI_LOG"
  sleep 1
done
warn "Started (pid $srv_pid) but health check timed out. Tail logs: $OPENUI_LOG"
