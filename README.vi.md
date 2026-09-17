<div align="center">

# 🌐 Holographic Sphere Launcher

### *"Quả Cầu Launcher"*

**Trình khởi chạy ứng dụng (Application Launcher) 3D Hologram siêu đẹp dành cho Linux Wayland (Hyprland, Sway, River, Wayfire...).**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Wayland](https://img.shields.io/badge/Wayland-Layer--Shell-00aaee.svg)](#tính-năng-nổi-bật)
[![Three.js](https://img.shields.io/badge/WebGL-Three.js-black.svg)](#tính-năng-nổi-bật)
[![GTK3](https://img.shields.io/badge/Toolkit-GTK3-4a90e2.svg)](#cài-đặt-gói-phụ-thuộc)
[![Release](https://img.shields.io/github/v/release/conlongnhong/sphere-launcher?color=orange)](https://github.com/conlongnhong/sphere-launcher/releases)
[![CI](https://github.com/conlongnhong/sphere-launcher/actions/workflows/ci.yml/badge.svg)](https://github.com/conlongnhong/sphere-launcher/actions)

[English](README.md) • [Tiếng Việt](README.vi.md)

<br/>

<img src="assets/preview.png" alt="Ảnh minh họa Holographic Sphere Launcher" width="90%" style="border-radius: 12px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);" />

</div>

---

## 🎬 Video Trải Nghiệm Thực Tế

<div align="center">

<img src="assets/demo.webp" alt="Hình động trải nghiệm Quả Cầu Launcher" width="85%" style="border-radius: 10px;" />

<p>
  🎥 <b>Xem video gốc 1080p 60fps</b>: 
  <a href="https://github.com/conlongnhong/sphere-launcher/releases/download/v1.0.0/recording_2026-09-17_19.26.25.mp4"><b>Tải xuống / Xem recording_2026-09-17_19.26.25.mp4 (49MB)</b></a> 
  • <a href="assets/demo.mp4">Xem clip ngắn cục bộ (3MB)</a>
</p>

</div>

---

## ✨ Tính Năng Nổi Bật

- **Quả Cầu 3D Hologram Siêu Đẹp**: Dựng bằng WebGL/Three.js với đầy đủ đa giác lục địa, đường bờ biển và biên giới quốc gia hai mặt cầu, lưới tam giác nổi trên mặt đất, các điểm năng lượng (hotspot) và hiệu ứng ánh sáng bloom trắng ma mị.
- **Tương Tác Xoay 3D Trực Tiếp**: Dùng chuột kéo để xoay quả cầu tự do trong không gian 3D. Lăn con cuộn chuột để tăng/giảm tốc độ tự quay từ `0.5x` đến `2.5x`.
- **Nền Trong Suốt Không Che Hình Nền**: Chạy trực tiếp qua giao thức `gtk-layer-shell`, phủ toàn màn hình nhưng nền trong suốt, giữ nguyên wallpaper và các cửa sổ bên dưới.
- **6 Thẻ Vệ Tinh Nối Dây Quang Học (Trace Lines)**: 6 thẻ ứng dụng nổi hai bên được nối với toạ độ 3D trên quả cầu bằng các đường cong Bézier SVG phát sáng và hạt photon chuyển động.
- **Tìm Kiếm Ứng Dụng Tức Thì**: Gõ phím để tìm kiếm nhanh các ứng dụng đã cài đặt trên máy (`.desktop` files). Tìm theo tên, mô tả, từ khóa, lệnh khởi chạy.
- **Bật/Tắt Siêu Tốc (Warm IPC Daemon)**: Hoạt động qua Unix socket daemon ngầm (`/tmp/sphere_launcher.sock`), gán phím tắt bật/tắt tức thì không độ trễ.
- **Hoàn Toàn Offline**: Dữ liệu Three.js và bản đồ địa lý (`land.json`, `countries-110m.json`) đã được nén sẵn nội bộ, không cần kết nối mạng khi chạy.
- **Tự Động Fallback**: Tự nhận diện và chuyển sang cửa sổ tràn màn hình nếu chạy trên môi trường không hỗ trợ `wlr-layer-shell`.

---

## 📦 Cài Đặt Gói Phụ Thuộc

Trước khi chạy, máy cần có Python 3, PyGObject, GTK 3, GtkLayerShell và WebKit2GTK:

| Hệ điều hành | Lệnh cài đặt |
| :--- | :--- |
| **Arch Linux / Manjaro** | `sudo pacman -S --needed gtk3 gtk-layer-shell webkit2gtk-4.1 python-gobject` |
| **Fedora** | `sudo dnf install -y gtk3 gtk-layer-shell webkit2gtk4.1 python3-gobject` |
| **Ubuntu / Debian / Mint** | `sudo apt update && sudo apt install -y python3-gi gir1.2-gtk-3.0 gir1.2-gtklayershell-0.1 gir1.2-webkit2-4.1` |
| **openSUSE** | `sudo zypper in -y gtk3 gtk-layer-shell typelib-1_0-WebKit2-4_1 python3-gobject` |
| **Void Linux** | `sudo xbps-install -S python3-gobject gtk+3 gtk-layer-shell webkit2gtk` |

---

## 🚀 Hướng Dẫn Cài Đặt

### Cách 1: Cài tự động bằng 1 dòng lệnh (Khuyên Dùng)

```bash
curl -fsSL https://raw.githubusercontent.com/conlongnhong/sphere-launcher/main/install.sh | bash
```

### Cách 2: Clone repository và cài đặt

```bash
git clone https://github.com/conlongnhong/sphere-launcher.git
cd sphere-launcher
./install.sh
```

Script sẽ tự động:
1. Nhận diện hệ điều hành và kiểm tra/cài đặt các thư viện cần thiết.
2. Sao chép mã nguồn vào `~/.local/share/sphere-launcher/`.
3. Tạo hai lệnh `sphere-launcher` và `sphere-toggle` trong `~/.local/bin/`.
4. Tạo file desktop entry `~/.local/share/applications/sphere-launcher.desktop`.

### Cách 3: Dành cho Arch Linux (PKGBUILD)

```bash
git clone https://github.com/conlongnhong/sphere-launcher.git
cd sphere-launcher/packaging/arch
makepkg -si
```

---

## ⌨️ Cài Đặt Phím Tắt Khởi Động

Chỉ cần gán lệnh `sphere-toggle` vào phím tắt trong file cấu hình compositor của bạn:

### Hyprland (`~/.config/hypr/hyprland.conf`)

```ini
# Mở/đóng launcher bằng phím Super + Phím cách
bind = SUPER, SPACE, exec, sphere-toggle

# Hoặc chỉ cần bấm phím Super (Windows) là mở
bindr = SUPER, SUPER_L, exec, sphere-toggle
```

### Sway (`~/.config/sway/config`)

```ini
bindsym $mod+space exec sphere-toggle
```

### River (`~/.config/river/init`)

```bash
riverctl map normal Super Space spawn sphere-toggle
```

### Wayfire (`~/.config/wayfire.ini`)

```ini
[command]
binding_launcher = <super> KEY_SPACE
command_launcher = sphere-toggle
```

---

## 🎮 Cách Điều Khiển & Phím Tắt

| Thao tác | Chức năng |
| :--- | :--- |
| **Gõ chữ** | Tìm kiếm trực tiếp ứng dụng |
| `↓` / `Tab` | Hiện ứng dụng khi ô tìm kiếm trống / Di chuyển xuống |
| `↑` / `Shift+Tab` | Di chuyển lên |
| `←` / `→` | Chuyển đổi giữa 2 cột ứng dụng trái/phải |
| `Enter` / **Click chuột** | Mở ứng dụng đã chọn và đóng launcher |
| `Esc` / **Click ra ngoài** | Đóng launcher |
| **Nhấn giữ & kéo quả cầu** | Xoay quả cầu 3D theo mọi hướng |
| **Cuộn chuột trên quả cầu** | Đổi tốc độ tự xoay (`0.5x` đến `2.5x`) |

---

## 🛠️ Lệnh Command Line (CLI)

```bash
sphere-launcher            # Khởi động launcher daemon (hoặc hiện lên nếu đang chạy)
sphere-launcher --toggle   # Bật/tắt cửa sổ launcher (hoặc dùng 'sphere-toggle')
sphere-launcher --show     # Hiện launcher
sphere-launcher --hide     # Ẩn launcher
sphere-launcher --quit     # Dừng hẳn daemon chạy ngầm
sphere-launcher --version  # Xem phiên bản
sphere-launcher --help     # Xem bảng hướng dẫn các lệnh
```

---

## 💖 Ủng Hộ / Donate

Nếu bạn thích **Quả Cầu Launcher** và thấy nó hữu ích, bạn có thể mời mình một ly cà phê để tiếp thêm động lực phát triển thêm nhiều tính năng mới nhé!

<div align="center">

<img src="assets/donate.png" alt="Mã QR Donate" width="280px" style="border-radius: 12px; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);" />

<p>
  <b>MoMo / VietQR / Napas 247</b><br/>
  <b>NGUYỄN NAM DƯƠNG</b><br/>
  <code>STK: *******220</code>
</p>

*Cảm ơn sự ủng hộ và đồng hành của bạn rất nhiều! 🙏*

</div>

---

## 🧪 Chạy Kiểm Thử (Tests)

Để kiểm tra độ tương thích tỷ lệ màn hình (1024×576, 1920×1080), phép chiếu toạ độ cầu và thuật toán xử lý đa giác địa lý:

```bash
node --test sphere_launcher/tests/geometry.test.cjs
node --check sphere_launcher/web/globe.js
node --check sphere_launcher/web/app.js
python3 -m py_compile sphere_launcher/main.py
```

---

## 🗑️ Gỡ Cài Đặt (Uninstall)

Để xóa hoàn toàn Sphere Launcher khỏi hệ thống:

```bash
curl -fsSL https://raw.githubusercontent.com/conlongnhong/sphere-launcher/main/uninstall.sh | bash
```

Hoặc trong thư mục mã nguồn:
```bash
./uninstall.sh
```

---

## 📄 Bản Quyền (License)

Mã nguồn mở theo giấy phép [MIT License](LICENSE). Mọi người đều có thể tự do sử dụng, chỉnh sửa và đóng góp!
