#!/usr/bin/env bash
# ==============================================================================
# Holographic Sphere Launcher Uninstaller
# ==============================================================================
set -euo pipefail

GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}Uninstalling Sphere Launcher...${NC}"

# 1. Stop daemon if running
SOCKET="/tmp/sphere_launcher.sock"
if [ -S "$SOCKET" ]; then
    python3 -c "
import socket
try:
    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    s.settimeout(0.5)
    s.connect('$SOCKET')
    s.sendall(b'quit\n')
    s.close()
except Exception:
    pass
" 2>/dev/null || true
fi
rm -f "$SOCKET" 2>/dev/null || true

# 2. Remove files
if [ "${EUID:-$(id -u)}" -eq 0 ]; then
    rm -rf "/usr/share/sphere-launcher"
    rm -f "/usr/bin/sphere-launcher" "/usr/bin/sphere-toggle"
    rm -f "/usr/share/applications/sphere-launcher.desktop"
    echo -e "${GREEN}✓ Removed system-wide files from /usr.${NC}"
else
    USER_SHARE="${XDG_DATA_HOME:-$HOME/.local/share}"
    rm -rf "$USER_SHARE/sphere-launcher"
    rm -f "$HOME/.local/bin/sphere-launcher" "$HOME/.local/bin/sphere-toggle"
    rm -f "$USER_SHARE/applications/sphere-launcher.desktop"
    echo -e "${GREEN}✓ Removed user files from ~/.local.${NC}"
fi

if command -v update-desktop-database &>/dev/null; then
    update-desktop-database "${XDG_DATA_HOME:-$HOME/.local/share}/applications" 2>/dev/null || true
fi

echo -e "${GREEN}✓ Sphere Launcher has been completely uninstalled.${NC}"
