#!/bin/bash
#
# OpenUI — Meta Devserver Setup
#
# One-command setup for OpenUI on any Meta devserver (devvm/devgpu).
# Run this script from a terminal with internet proxy access (not from Claude Code agent).
#
# Usage:
#   curl/scp this script to your devserver, then:
#     bash devserver-setup.sh
#
#   Or if the repo is already cloned:
#     bash scripts/devserver-setup.sh
#

set -euo pipefail

OPENUI_PORT="${OPENUI_PORT:-44101}"
LOCAL_BIN="$HOME/local/bin"
LOCAL_LIB="$HOME/local/lib"
OPENUI_DIR="$HOME/openui"
REGISTRY="https://registry.facebook.net/"
HOSTNAME=$(hostname)

info()  { echo -e "\033[1;34m==>\033[0m \033[1m$*\033[0m"; }
ok()    { echo -e "\033[1;32m  ✓\033[0m $*"; }
warn()  { echo -e "\033[1;33m  !\033[0m $*"; }
fail()  { echo -e "\033[1;31m  ✗\033[0m $*"; exit 1; }

# ── Step 1: Local bin directory ──────────────────────────────────────────────

info "Setting up local bin directory"
mkdir -p "$LOCAL_BIN" "$LOCAL_LIB"

if ! grep -q 'local/bin' "$HOME/.bashrc" 2>/dev/null; then
    echo '' >> "$HOME/.bashrc"
    echo '# OpenUI: Node v22, Bun, pnpm' >> "$HOME/.bashrc"
    echo "export PATH=\"$LOCAL_BIN:\$PATH\"" >> "$HOME/.bashrc"
    ok "Added $LOCAL_BIN to PATH in ~/.bashrc"
else
    ok "PATH already configured in ~/.bashrc"
fi
export PATH="$LOCAL_BIN:$PATH"

# ── Step 2: Node v22 ────────────────────────────────────────────────────────

info "Setting up Node v22"
NODE_SRC=$(find /usr/local/fbpkg/vscodefb/vscode-server -name node -type f 2>/dev/null | sort -V | tail -1)

if [ -z "$NODE_SRC" ]; then
    fail "No Node binary found in /usr/local/fbpkg/vscodefb/vscode-server/. Cannot proceed."
fi

NODE_VERSION=$("$NODE_SRC" --version 2>/dev/null)
ln -sf "$NODE_SRC" "$LOCAL_BIN/node"
ok "Node $NODE_VERSION symlinked from $NODE_SRC"

# ── Step 3: Bun ─────────────────────────────────────────────────────────────

info "Installing Bun"
if [ -x "$LOCAL_BIN/bun" ]; then
    ok "Bun $(bun --version) already installed"
else
    TMPDIR=$(mktemp -d)
    pushd "$TMPDIR" > /dev/null
    echo '{"name":"bun-install","version":"1.0.0"}' > package.json

    "$LOCAL_BIN/node" /usr/lib/node_modules/yarn/bin/yarn.js add bun \
        --ignore-engines --registry "$REGISTRY" --silent 2>&1 | tail -3

    BUN_BIN=$(find "$TMPDIR/node_modules/@oven" -name 'bun' -path '*/bun-linux-x64/bin/*' -type f 2>/dev/null | head -1)
    if [ -z "$BUN_BIN" ]; then
        BUN_BIN=$(find "$TMPDIR/node_modules/@oven" -name 'bun' -path '*/bun-linux-x64-baseline/bin/*' -type f 2>/dev/null | head -1)
    fi

    if [ -z "$BUN_BIN" ]; then
        fail "Could not find Bun binary after install"
    fi

    cp "$BUN_BIN" "$LOCAL_BIN/bun"
    chmod +x "$LOCAL_BIN/bun"
    popd > /dev/null
    rm -rf "$TMPDIR"
    ok "Bun $($LOCAL_BIN/bun --version) installed"
fi

# ── Step 4: Clone repo ──────────────────────────────────────────────────────

info "Setting up OpenUI repo"
if [ -d "$OPENUI_DIR/.git" ]; then
    ok "Repo already exists at $OPENUI_DIR"
else
    HTTPS_PROXY=http://fwdproxy:8080 git clone \
        https://github.com/mihirKachroo/openui.git "$OPENUI_DIR" 2>&1
    ok "Cloned to $OPENUI_DIR"
fi

# ── Step 5: Configure internal registry ─────────────────────────────────────

info "Configuring internal npm registry"
for dir in "$OPENUI_DIR" "$OPENUI_DIR/client"; do
    cat > "$dir/bunfig.toml" << EOF
[install]
registry = "$REGISTRY"
EOF
done
ok "bunfig.toml written for server and client"

# ── Step 6: Install dependencies ────────────────────────────────────────────

info "Installing server dependencies"
cd "$OPENUI_DIR"
bun install 2>&1 | tail -3
ok "Server dependencies installed"

info "Installing client dependencies"
cd "$OPENUI_DIR/client"
bun install 2>&1 | tail -3
ok "Client dependencies installed"

# ── Step 7: Build client ────────────────────────────────────────────────────

info "Building client"
cd "$OPENUI_DIR/client"
bun run build 2>&1 | tail -3
ok "Client built"

# ── Step 8: Create startup script ────────────────────────────────────────────

info "Creating startup script"
cat > "$OPENUI_DIR/start.sh" << 'STARTEOF'
#!/bin/bash
export PATH="$HOME/local/bin:$PATH"
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

cd "$HOME/openui"
exec bun run server/index.ts
STARTEOF
chmod +x "$OPENUI_DIR/start.sh"
ok "start.sh created"

# ── Step 9: Start server ────────────────────────────────────────────────────

info "Starting OpenUI"
tmux kill-session -t openui 2>/dev/null || true
tmux new-session -d -s openui "$OPENUI_DIR/start.sh"

sleep 2
if curl -s -o /dev/null -w '' "http://localhost:$OPENUI_PORT/" 2>/dev/null; then
    ok "OpenUI is running on port $OPENUI_PORT"
else
    warn "Server may still be starting — check with: tmux attach -t openui"
fi

# ── Done ─────────────────────────────────────────────────────────────────────

echo ""
info "Setup complete!"
echo ""
echo "  Access:"
echo "    VPNless:     http://${HOSTNAME}.fbinfra.net:${OPENUI_PORT}"
echo "    SSH tunnel:  ssh -L ${OPENUI_PORT}:localhost:${OPENUI_PORT} ${HOSTNAME}"
echo "                 then open http://localhost:${OPENUI_PORT}"
echo ""
echo "  Commands:"
echo "    tmux attach -t openui     — view server logs"
echo "    tmux kill-session -t openui — stop the server"
echo "    ~/openui/start.sh         — restart the server"
echo ""
