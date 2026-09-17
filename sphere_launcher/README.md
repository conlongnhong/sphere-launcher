# Holographic Sphere Launcher

Launcher ứng dụng cho Wayland, dựng quả cầu hologram theo video tham chiếu:
đường bờ và biên giới ở cả hai mặt, lưới tam giác trên đất liền, hạt sáng,
bloom trắng, sáu thẻ ứng dụng và ô tìm kiếm phía dưới. Nền trong suốt giữ
nguyên wallpaper hiện tại; wallpaper và thanh trạng thái trong video không
phải thành phần của launcher.

## Chạy

Từ thư mục gốc dự án:

```bash
bash scripts/sphere-toggle
```

Lệnh khởi động launcher nếu chưa chạy, hoặc bật/tắt cửa sổ nếu đã chạy.
Log nằm tại `/tmp/sphere_launcher.log`. Host cần Python/PyGObject, GTK 3,
GtkLayerShell và WebKit2GTK 4.1 trên compositor hỗ trợ layer-shell.
Three.js và dữ liệu bản đồ được đóng gói sẵn, không cần mạng lúc chạy.

## Điều khiển

- Gõ để tìm ứng dụng; khi ô trống, nhấn `↓` hoặc `Tab` để hiện sáu ứng dụng đầu.
- Phím mũi tên hoặc `Tab` / `Shift+Tab` để chọn; `Enter` hoặc click để mở.
- Kéo quả cầu để xoay; cuộn chuột đổi tốc độ từ `0.5x` đến `2.5x`.
- `Esc` hoặc click nền để ẩn. Hoạt ảnh dừng khi cửa sổ ẩn.

## Kiểm tra

```bash
node --test sphere_launcher/tests/geometry.test.cjs
node --check sphere_launcher/web/globe.js
node --check sphere_launcher/web/app.js
```

Các test kiểm tra tỷ lệ ở 1024×576 và 1920×1080, phép chiếu địa lý, vùng
đất có lỗ hoặc đi qua kinh tuyến 180°, tính xác định của lưới, độ dài đoạn
vẽ và hiệu ứng xuất hiện.

Các giá trị hình ảnh chính nằm trong `web/globe.js`: `GLOBE_CENTER_Y`,
`ROTATION_SPEED`, `INITIAL_ROTATION`, `computeGlobeRadius`, `createHotspots`
và `initBloomPipeline`. Bố cục thẻ và tìm kiếm nằm trong `web/style.css`.
