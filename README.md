# Ticket Seller

Web bán vé sự kiện — dự án học backend + DevSecOps. Thiết kế chi tiết: [Design.md](Design.md).

## Cần cài sẵn

- [Node.js](https://nodejs.org) **24+**
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (để chạy Postgres)

## Chạy lần đầu

```bash
git clone https://github.com/alovanto/Ticket-Seller.git
cd Ticket-Seller

# 1. Tạo file bí mật từ mẫu, rồi mở .env và đặt 2 mật khẩu của riêng bạn
#    (POSTGRES_PASSWORD và APP_DB_PASSWORD: mỗi cái ≥ 16 ký tự, khác nhau)
cp .env.example .env            # Windows PowerShell: copy .env.example .env

# 2. Chạy Postgres (Docker tự tải image lần đầu)
docker compose up -d

# 3. Cài thư viện, tạo bảng, đổ dữ liệu thử
cd api
npm ci
npm run db:migrate
npm run db:seed

# 4. Chạy API (tự chạy lại khi sửa code)
npm run dev
```

Mở <http://127.0.0.1:3000/api/events> để xem danh sách sự kiện.

## Các lệnh (chạy trong thư mục `api/`)

| Lệnh | Làm gì |
| --- | --- |
| `npm run dev` | Chạy API, tự khởi động lại khi lưu file |
| `npm start` | Chạy API một lần |
| `npm run typecheck` | Kiểm tra lỗi kiểu TypeScript |
| `npm run db:migrate` | Chạy các migration **chưa chạy** (an toàn, chạy lại bao nhiêu lần cũng được) |
| `npm run db:seed` | Xóa dữ liệu thử và đổ lại — **chỉ dùng cho dev** |
| `npm run db:reset` | **Xóa sạch DB**, chạy lại toàn bộ migration + seed — **chỉ dùng cho dev** |

`db:seed` và `db:reset` từ chối chạy khi `NODE_ENV=production`.

## API hiện có

| Endpoint | Mô tả |
| --- | --- |
| `GET /health` | Tiến trình còn sống không (không kiểm tra DB) |
| `GET /ready` | Sẵn sàng phục vụ không — 200 nếu DB ổn, 503 nếu DB không trả lời |
| `GET /api/events` | Danh sách sự kiện đang mở bán |
| `GET /api/events/:id` | Chi tiết sự kiện + các loại vé, giá, số vé còn lại |

## User database (quyền tối thiểu)

| User | Ai dùng | Quyền |
| --- | --- | --- |
| `POSTGRES_USER` (mặc định `ticket`) | `docker compose`, `db:migrate` / `db:seed` / `db:reset` | Chủ các bảng (admin) |
| `app` | API server | Chỉ `SELECT` / `INSERT` / `UPDATE` trên bảng nghiệp vụ. **Không** `DELETE`, `TRUNCATE`, `DROP`, `ALTER`, tạo bảng, tạo user |

- User `app` được tạo trong `db/migrations/002_create_app_role.sql`; mật khẩu lấy từ `APP_DB_PASSWORD`
  và được đặt mỗi lần chạy `db:migrate` (muốn đổi mật khẩu: sửa `.env` rồi chạy lại `db:migrate`).
- API server **không cần** mật khẩu admin. Khi deploy, chỉ đưa `APP_DB_PASSWORD` cho API.
- Bảng tạo trong migration sau tự có cùng quyền cho `app`. Cần thêm quyền (vd `DELETE`) thì cấp
  rõ ràng trong migration mới.

## Thêm thay đổi cấu trúc DB

Tạo file mới trong `db/migrations/` với số thứ tự tiếp theo, ví dụ `002_create_orders.sql`,
rồi chạy `npm run db:migrate`.

- **Không sửa** file migration đã chạy — công cụ sẽ phát hiện (checksum) và dừng lại.
- **Không xóa** file migration cũ — DB mới sẽ không dựng lại được.
- Không viết `BEGIN`/`COMMIT` trong file migration — mỗi file đã tự chạy trong 1 transaction.
