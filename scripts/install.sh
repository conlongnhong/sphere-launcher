#!/usr/bin/env bash
# ==============================================================================
# Holographic Sphere Launcher Installer ("Quả Cầu Launcher")
# Works on Arch, Fedora, Ubuntu/Debian, openSUSE, and any Wayland distro.
# ==============================================================================
set -euo pipefail

BOLD='\033[1m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BOLD}${BLUE}"
echo "  ╔═══════════════════════════════════════════════════════════╗"
echo "  ║         Holographic Sphere Launcher Installer             ║"
echo "  ║         Quả Cầu Launcher cho Linux & Wayland              ║"
echo "  ╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Determine installation mode: system or user
if [ "${EUID:-$(id -u)}" -eq 0 ]; then
    INSTALL_DIR="/usr/share/sphere-launcher"
    BIN_DIR="/usr/bin"
    DESKTOP_DIR="/usr/share/applications"
    echo -e "${YELLOW}Notice: Running as root. Installing system-wide to /usr.${NC}"
else
    INSTALL_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/sphere-launcher"
    BIN_DIR="${HOME}/.local/bin"
    DESKTOP_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
fi

# 1. Check Python 3
if ! command -v python3 &>/dev/null; then
    echo -e "${RED}Error: python3 is not installed. Please install Python 3 first.${NC}"
    exit 1
fi

# 2. Check and install dependencies
check_dependencies() {
    python3 -c "
import gi
gi.require_version('Gtk', '3.0')
gi.require_version('GtkLayerShell', '0.1')
try:
    gi.require_version('WebKit2', '4.1')
except ValueError:
    gi.require_version('WebKit2', '4.0')
from gi.repository import Gtk, GtkLayerShell, WebKit2
" 2>/dev/null
}

if ! check_dependencies; then
    echo -e "${YELLOW}Missing system dependencies (GTK3, GtkLayerShell, WebKit2GTK, PyGObject).${NC}"
    
    DISTRO="unknown"
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        DISTRO="${ID:-unknown}"
        DISTRO_LIKE="${ID_LIKE:-}"
    fi

    INSTALL_CMD=""
    case "$DISTRO" in
        arch|manjaro|endeavouros|garuda|cachyos)
            INSTALL_CMD="sudo pacman -S --needed gtk3 gtk-layer-shell webkit2gtk-4.1 python-gobject"
            ;;
        fedora|rhel|centos)
            INSTALL_CMD="sudo dnf install -y gtk3 gtk-layer-shell webkit2gtk4.1 python3-gobject"
            ;;
        ubuntu|debian|linuxmint|pop)
            INSTALL_CMD="sudo apt update && sudo apt install -y python3-gi gir1.2-gtk-3.0 gir1.2-gtklayershell-0.1 gir1.2-webkit2-4.1"
            ;;
        opensuse*|suse)
            INSTALL_CMD="sudo zypper in -y gtk3 gtk-layer-shell typelib-1_0-WebKit2-4_1 python3-gobject"
            ;;
        void)
            INSTALL_CMD="sudo xbps-install -S python3-gobject gtk+3 gtk-layer-shell webkit2gtk"
            ;;
        *)
            if [[ "${DISTRO_LIKE:-}" =~ "arch" ]]; then
                INSTALL_CMD="sudo pacman -S --needed gtk3 gtk-layer-shell webkit2gtk-4.1 python-gobject"
            elif [[ "${DISTRO_LIKE:-}" =~ "debian" ]] || [[ "${DISTRO_LIKE:-}" =~ "ubuntu" ]]; then
                INSTALL_CMD="sudo apt update && sudo apt install -y python3-gi gir1.2-gtk-3.0 gir1.2-gtklayershell-0.1 gir1.2-webkit2-4.1"
            elif [[ "${DISTRO_LIKE:-}" =~ "fedora" ]]; then
                INSTALL_CMD="sudo dnf install -y gtk3 gtk-layer-shell webkit2gtk4.1 python3-gobject"
            fi
            ;;
    esac

    if [ -n "$INSTALL_CMD" ]; then
        echo -e "${BLUE}Suggested command for your system (${DISTRO}):${NC}"
        echo -e "  ${BOLD}${INSTALL_CMD}${NC}\n"
        
        # If terminal is interactive, ask user
        if [ -t 0 ]; then
            read -rp "Would you like to install dependencies automatically now? [y/N] " answer
            if [[ "$answer" =~ ^[Yy]$ ]]; then
                eval "$INSTALL_CMD"
            fi
        fi
    else
        echo -e "${RED}Please install GTK3, GtkLayerShell, WebKit2GTK, and Python PyGObject using your system package manager.${NC}"
    fi

    # Re-verify
    if ! check_dependencies; then
        echo -e "${YELLOW}Warning: Dependencies not verified yet. Continuing installation anyway...${NC}"
    else
        echo -e "${GREEN}✓ All dependencies verified.${NC}"
    fi
else
    echo -e "${GREEN}✓ All required dependencies are satisfied.${NC}"
fi

# 3. Create destination directories
echo -e "\n${BLUE}Installing files to:${NC} ${INSTALL_DIR}"
mkdir -p "$INSTALL_DIR"
mkdir -p "$BIN_DIR"
mkdir -p "$DESKTOP_DIR"

# 4. Copy project files
cp -r "$REPO_ROOT/sphere_launcher/"* "$INSTALL_DIR/"
chmod +x "$INSTALL_DIR/main.py"

# 5. Install executable wrappers
cp "$REPO_ROOT/bin/sphere-launcher" "$BIN_DIR/sphere-launcher"
cp "$REPO_ROOT/bin/sphere-toggle" "$BIN_DIR/sphere-toggle"
chmod +x "$BIN_DIR/sphere-launcher" "$BIN_DIR/sphere-toggle"

# 6. Install desktop entry
cp "$REPO_ROOT/desktop/sphere-launcher.desktop" "$DESKTOP_DIR/sphere-launcher.desktop"
if command -v update-desktop-database &>/dev/null; then
    update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
fi

echo -e "${GREEN}✓ Successfully installed sphere-launcher!${NC}\n"

# 7. PATH verification
if [[ ":$PATH:" != *":$BIN_DIR:"* ]] && [ "$BIN_DIR" != "/usr/bin" ]; then
    echo -e "${YELLOW}Note: ${BIN_DIR} is not currently in your PATH.${NC}"
    echo -e "Add this line to your ~/.bashrc or ~/.zshrc:"
    echo -e "  ${BOLD}export PATH=\"\$HOME/.local/bin:\$PATH\"${NC}\n"
fi

# 8. Setup Hotkey Instructions
echo -e "${BOLD}=== HOW TO USE / HƯỚNG DẪN DÙNG ===${NC}"
echo -e "Run directly or toggle visibility:"
echo -e "  ${BOLD}sphere-toggle${NC}   or   ${BOLD}sphere-launcher --toggle${NC}\n"
echo -e "Add a hotkey in your Wayland compositor config:\n"
echo -e "  • ${BOLD}Hyprland${NC} (~/.config/hypr/hyprland.conf):"
echo -e "      ${GREEN}bind = SUPER, SPACE, exec, sphere-toggle${NC}\n"
echo -e "  • ${BOLD}Sway${NC} (~/.config/sway/config):"
echo -e "      ${GREEN}bindsym \$mod+space exec sphere-toggle${NC}\n"
echo -e "  • ${BOLD}River${NC} (~/.config/river/init):"
echo -e "      ${GREEN}riverctl map normal Super Space spawn sphere-toggle${NC}\n"
