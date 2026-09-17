#!/usr/bin/env python3
"""
Holographic 3D Globe Application Launcher ("Quả Cầu Launcher")
Native Wayland Layer-Shell Host with GTK3, GtkLayerShell, and WebKit2GTK.
Holographic globe composition recreated from the reference video.
"""

import os
import sys
import json
import glob
import base64
import socket
import threading
import subprocess
import configparser

try:
    import gi
    gi.require_version('Gtk', '3.0')
    gi.require_version('Gdk', '3.0')
    gi.require_version('GtkLayerShell', '0.1')
    try:
        gi.require_version('WebKit2', '4.1')
        gi.require_version('JavaScriptCore', '4.1')
    except (ValueError, AttributeError):
        gi.require_version('WebKit2', '4.0')
        gi.require_version('JavaScriptCore', '4.0')

    from gi.repository import Gtk, Gdk, GtkLayerShell, WebKit2, GLib
except (ValueError, ImportError) as err:
    print(f"[SphereLauncher] Error: Missing required system dependencies ({err}).\n", file=sys.stderr)
    print("Please install the required packages for your Linux distribution:", file=sys.stderr)
    print("  • Arch Linux:    sudo pacman -S gtk3 gtk-layer-shell webkit2gtk-4.1 python-gobject", file=sys.stderr)
    print("  • Fedora:        sudo dnf install gtk3 gtk-layer-shell webkit2gtk4.1 python3-gobject", file=sys.stderr)
    print("  • Debian/Ubuntu: sudo apt install python3-gi gir1.2-gtk-3.0 gir1.2-gtklayershell-0.1 gir1.2-webkit2-4.1", file=sys.stderr)
    print("  • openSUSE:      sudo zypper in gtk3 gtk-layer-shell typelib-1_0-WebKit2-4_1 python3-gobject", file=sys.stderr)
    print("\nOr run the automated installer: bash scripts/install.sh\n", file=sys.stderr)
    sys.exit(1)


SOCKET_PATH = "/tmp/sphere_launcher.sock"
WEB_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "web")
INDEX_URL = "file://" + os.path.join(WEB_DIR, "index.html")

class SphereLauncherApp:
    def __init__(self):
        self.window = None
        self.webview = None
        self.is_visible = False
        self.icon_theme = Gtk.IconTheme.get_default()
        self.cached_apps = []

        # 1. Scan applications on startup
        self.scan_applications()

        # 2. Build Layer-Shell Window
        self.setup_window()

        # 3. Setup IPC Socket Listener
        self.setup_ipc_socket()

    def resolve_icon(self, icon_name):
        if not icon_name:
            return ""
        if os.path.isabs(icon_name) and os.path.exists(icon_name):
            return icon_name
        
        info = self.icon_theme.lookup_icon(icon_name, 64, 0)
        if info:
            fn = info.get_filename()
            if fn and os.path.exists(fn):
                return fn
        
        # Check standard pixmaps
        for ext in ['.svg', '.png', '.xpm']:
            p = os.path.join('/usr/share/pixmaps', icon_name + ext)
            if os.path.exists(p):
                return p

        # Check hicolor scalable
        for d in ['/usr/share/icons/hicolor/scalable/apps', '/usr/share/icons/hicolor/48x48/apps', '/usr/share/icons/hicolor/64x64/apps']:
            p_svg = os.path.join(d, icon_name + '.svg')
            p_png = os.path.join(d, icon_name + '.png')
            if os.path.exists(p_svg):
                return p_svg
            if os.path.exists(p_png):
                return p_png

        return ""

    def get_icon_data_url(self, file_path):
        if not file_path or not os.path.exists(file_path):
            return ""
        try:
            with open(file_path, 'rb') as f:
                raw = f.read()
            lower = file_path.lower()
            if lower.endswith('.svg'):
                mime = 'image/svg+xml'
            elif lower.endswith('.png'):
                mime = 'image/png'
            elif lower.endswith('.jpg') or lower.endswith('.jpeg'):
                mime = 'image/jpeg'
            else:
                mime = 'image/png'
            return f"data:{mime};base64,{base64.b64encode(raw).decode('ascii')}"
        except Exception:
            return ""

    def scan_applications(self):
        desktop_dirs = [
            os.path.expanduser('~/.local/share/applications'),
            '/usr/share/applications',
            '/var/lib/flatpak/exports/share/applications'
        ]

        seen_ids = set()
        apps = []

        # Default high-priority apps
        priority_keywords = ['brave', 'chrome', 'firefox', 'ghostty', 'terminal', 'code', 'files', 'nautilus', 'spotify', 'discord', 'telegram']

        for d in desktop_dirs:
            if not os.path.exists(d):
                continue
            for path in glob.glob(os.path.join(d, '**/*.desktop'), recursive=True):
                basename = os.path.basename(path)
                if basename in seen_ids:
                    continue
                seen_ids.add(basename)
                try:
                    cp = configparser.ConfigParser(interpolation=None, strict=False)
                    cp.read(path, encoding='utf-8')
                    if not cp.has_section('Desktop Entry'):
                        continue
                    entry = cp['Desktop Entry']
                    if entry.get('NoDisplay', 'false').lower() == 'true':
                        continue
                    if entry.get('Type', 'Application') != 'Application':
                        continue
                    name = entry.get('Name', '')
                    if not name:
                        continue
                    exec_cmd = entry.get('Exec', '')
                    comment = entry.get('Comment', '') or entry.get('GenericName', '')
                    icon_name = entry.get('Icon', '')
                    icon_file = self.resolve_icon(icon_name)
                    icon_data = self.get_icon_data_url(icon_file)
                    categories = entry.get('Categories', '')

                    clean_exec = exec_cmd
                    for field_code in ['%u', '%U', '%f', '%F', '%i', '%c', '%k']:
                        clean_exec = clean_exec.replace(field_code, '').strip()

                    score = 100
                    lower_id = basename.lower()
                    lower_name = name.lower()
                    for idx, kw in enumerate(priority_keywords):
                        if kw in lower_id or kw in lower_name:
                            score = idx
                            break

                    apps.append({
                        'id': basename,
                        'name': name,
                        'comment': comment,
                        'icon': icon_file,
                        'icon_data': icon_data,
                        'exec': clean_exec,
                        'desktop_file': path,
                        'categories': categories,
                        'score': score
                    })
                except Exception:
                    pass

        apps.sort(key=lambda a: (a['score'], a['name'].lower()))
        self.cached_apps = apps
        print(f"[SphereLauncher] Scanned {len(apps)} applications.")

    def setup_window(self):
        self.window = Gtk.Window()
        self.window.set_title("Holographic Sphere Launcher")
        self.window.set_decorated(False)

        # Transparency
        screen = self.window.get_screen()
        visual = screen.get_rgba_visual()
        if visual and screen.is_composited():
            self.window.set_visual(visual)
        self.window.set_app_paintable(True)

        # LayerShell Config or Fullscreen Window Fallback
        self.has_layer_shell = GtkLayerShell.is_supported()
        if self.has_layer_shell:
            GtkLayerShell.init_for_window(self.window)
            GtkLayerShell.set_namespace(self.window, "sphere-launcher")
            GtkLayerShell.set_layer(self.window, GtkLayerShell.Layer.OVERLAY)

            for edge in [GtkLayerShell.Edge.TOP, GtkLayerShell.Edge.BOTTOM, GtkLayerShell.Edge.LEFT, GtkLayerShell.Edge.RIGHT]:
                GtkLayerShell.set_anchor(self.window, edge, True)

            # Draw against the complete output instead of being inset by Waybar's
            # reserved top edge. The reference composition is measured from the
            # physical screen bounds, and layer-shell uses -1 for that behavior.
            GtkLayerShell.set_exclusive_zone(self.window, -1)
        else:
            print("[SphereLauncher] Notice: wlr-layer-shell protocol not supported by current compositor session. Using fullscreen window fallback.")
            self.window.fullscreen()

        # WebKit Settings
        settings = WebKit2.Settings()
        settings.set_enable_webgl(True)
        settings.set_allow_file_access_from_file_urls(True)
        settings.set_allow_universal_access_from_file_urls(True)
        settings.set_enable_developer_extras(True)
        settings.set_enable_write_console_messages_to_stdout(True)

        ucm = WebKit2.UserContentManager()
        ucm.register_script_message_handler("launcher")
        ucm.connect("script-message-received::launcher", self.on_script_message)

        self.webview = WebKit2.WebView.new_with_user_content_manager(ucm)
        self.webview.set_settings(settings)
        self.webview.set_background_color(Gdk.RGBA(0, 0, 0, 0))
        self.webview.connect("load-changed", self.on_webview_load_changed)

        self.window.add(self.webview)
        self.window.show_all()
        if self.has_layer_shell:
            GtkLayerShell.set_keyboard_mode(self.window, GtkLayerShell.KeyboardMode.EXCLUSIVE)
        self.webview.load_uri(INDEX_URL)

        self.is_visible = True

    def on_webview_load_changed(self, webview, load_event):
        if load_event == WebKit2.LoadEvent.FINISHED:
            self.send_apps_to_web()

    def send_apps_to_web(self):
        apps_json = json.dumps(self.cached_apps)
        js_code = f"if (window.loadAppsFromHost) window.loadAppsFromHost({apps_json});"
        self.webview.evaluate_javascript(js_code, -1, None, None, None, None, None)

    def on_script_message(self, ucm, js_result):
        try:
            js_val = js_result.get_js_value()
            msg_str = js_val.to_string()
            data = json.loads(msg_str)
            action = data.get('action')

            if action == 'close':
                self.hide_launcher()
            elif action == 'launch':
                exec_cmd = data.get('exec')
                desktop_file = data.get('desktop_file')
                self.launch_application(exec_cmd, desktop_file)
            elif action == 'get_apps':
                self.send_apps_to_web()
        except Exception as e:
            print("[SphereLauncher] Script message error:", e)

    def launch_application(self, exec_cmd, desktop_file=None):
        print(f"[SphereLauncher] Launching: {exec_cmd}")
        self.hide_launcher()

        def do_launch():
            try:
                if desktop_file and os.path.exists(desktop_file):
                    subprocess.Popen(['gio', 'launch', desktop_file], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
                elif exec_cmd:
                    subprocess.Popen(exec_cmd, shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
            except Exception as ex:
                print(f"[SphereLauncher] Failed to launch: {ex}")

        threading.Thread(target=do_launch, daemon=True).start()

    def show_launcher(self):
        if not self.is_visible:
            self.window.show_all()
            if self.has_layer_shell:
                GtkLayerShell.set_keyboard_mode(self.window, GtkLayerShell.KeyboardMode.EXCLUSIVE)
            else:
                self.window.present()
            self.is_visible = True
            self.webview.evaluate_javascript("if(window.onLauncherShown) window.onLauncherShown();", -1, None, None, None, None, None)

    def hide_launcher(self):
        if self.is_visible:
            self.webview.evaluate_javascript("if(window.onLauncherHidden) window.onLauncherHidden();", -1, None, None, None, None, None)
            if self.has_layer_shell:
                GtkLayerShell.set_keyboard_mode(self.window, GtkLayerShell.KeyboardMode.NONE)
            self.window.hide()
            self.is_visible = False

    def toggle_launcher(self):
        if self.is_visible:
            self.hide_launcher()
        else:
            self.show_launcher()

    def setup_ipc_socket(self):
        def cleanup_socket():
            if os.path.exists(SOCKET_PATH):
                try:
                    os.remove(SOCKET_PATH)
                except OSError:
                    pass

        import atexit, signal
        atexit.register(cleanup_socket)
        signal.signal(signal.SIGINT, lambda s, f: sys.exit(0))
        signal.signal(signal.SIGTERM, lambda s, f: sys.exit(0))

        cleanup_socket()

        sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        sock.bind(SOCKET_PATH)
        sock.listen(5)

        def socket_listener():
            while True:
                try:
                    conn, _ = sock.accept()
                    data = conn.recv(1024).decode('utf-8').strip()
                    if data == 'toggle':
                        GLib.idle_add(self.toggle_launcher)
                    elif data == 'show':
                        GLib.idle_add(self.show_launcher)
                    elif data == 'hide':
                        GLib.idle_add(self.hide_launcher)
                    elif data == 'quit':
                        GLib.idle_add(Gtk.main_quit)
                        break
                    conn.sendall(b'OK\n')
                    conn.close()
                except Exception:
                    break

        t = threading.Thread(target=socket_listener, daemon=True)
        t.start()


def send_ipc_command(cmd, timeout=0.6):
    if os.path.exists(SOCKET_PATH):
        try:
            s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            s.settimeout(timeout)
            s.connect(SOCKET_PATH)
            s.sendall(f"{cmd}\n".encode('utf-8'))
            resp = s.recv(1024)
            s.close()
            return True
        except Exception:
            return False
    return False


def print_help():
    print("""Holographic Sphere Launcher ("Quả Cầu Launcher")
A native Wayland 3D holographic application launcher.

Usage:
  sphere-launcher [command]

Commands:
  (no args)           Start launcher daemon or show window if running
  --toggle, -t        Toggle launcher visibility (starts daemon if not running)
  --show,   -s        Show launcher window
  --hide              Hide launcher window
  --quit,   -q        Stop running background launcher daemon
  --version, -v       Show version information
  --help,   -h        Display this help message
""")


def main():
    args = sys.argv[1:]
    cmd = args[0] if args else ''

    if cmd in ['--help', '-h', 'help']:
        print_help()
        sys.exit(0)

    if cmd in ['--version', '-v', 'version']:
        print("sphere-launcher 1.0.0")
        sys.exit(0)

    if cmd in ['--quit', '-q', 'quit', 'stop']:
        if send_ipc_command('quit'):
            print("[SphereLauncher] Stopped background daemon.")
            sys.exit(0)
        else:
            print("[SphereLauncher] No active daemon found.")
            sys.exit(0)

    if cmd in ['--show', '-s', 'show']:
        if send_ipc_command('show'):
            sys.exit(0)

    if cmd in ['--hide', 'hide']:
        if send_ipc_command('hide'):
            sys.exit(0)

    if cmd in ['--toggle', '-t', 'toggle']:
        if send_ipc_command('toggle'):
            sys.exit(0)

    # If already running without explicit toggle command, toggle it
    if not cmd and send_ipc_command('toggle'):
        sys.exit(0)

    app = SphereLauncherApp()
    Gtk.main()


if __name__ == '__main__':
    main()
