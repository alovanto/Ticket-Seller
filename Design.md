# Thiết kế hệ thống Web bán vé

Nov 26, 2026 · @Ben EDOS

> Bản đặc tả full-chain cho web bán vé sự kiện. Bản học dùng **vé tự do (theo số lượng)** và **giả lập thanh toán**, để tập trung vào phần lõi: giao dịch nhất quán khi nhiều người mua cùng lúc.

## 1. Tổng quan & mục tiêu

Web bán vé sự kiện: người dùng xem sự kiện, chọn loại vé, giữ chỗ, thanh toán và nhận vé (mã/QR). Bản này làm **vé tự do theo số lượng** (còn/hết theo số lượng, chưa chọn ghế) và **giả lập thanh toán**.

Mục tiêu học tập: đây là một hệ **giao dịch** thật sự. Điểm khó và đáng giá nhất là **giữ dữ liệu luôn nhất quán khi nhiều người mua cùng lúc**: không bán quá số vé, không trừ tiền mà không xuất vé, không nhân đôi vé. Đây là bộ kỹ năng backend cốt lõi: transaction, khóa, idempotency và xử lý nền.

## 2. Phạm vi

**Trong phạm vi v1:**

- Xem danh sách sự kiện và loại vé còn lại
- Giữ chỗ tạm (hold) có hẹn giờ hết hạn
- Thanh toán giả lập (thành công/thất bại)
- Xuất vé + mã vé/QR, gửi email xác nhận
- Worker nhả vé khi hết giờ giữ chỗ
- Đăng nhập người dùng

**Để dành cho sau:**

- Chọn ghế (sơ đồ ghế)
- Cổng thanh toán thật + webhook + hoàn tiền
- Mã giảm giá, nhiều hạng vé phức tạp
- Trang quản trị cho ban tổ chức
- Check-in tại cửa bằng QR

**Cố tình bỏ:**

- Bán lại / chuyển nhượng vé
- Nhiều đơn vị tổ chức (multi-tenant)

## 3. Kiến trúc tổng thể

```
          Người dùng · SPA
                | HTTPS
                v
          Nginx (reverse proxy)
                |
                v
          API server --------> Thanh toán (giả lập)
             |                   (xác nhận trả tiền)
     +-------+--------+
     v       v        v
  Redis   Postgres  Hàng đợi
 (đếm vé) (chuẩn)      |
                        v
                   Worker nền
              (nhả vé hết hạn,
               ghi vé, gửi mail)
```

Đường đọc (xem vé còn lại) ưu tiên Redis; đường ghi (giữ chỗ, trừ vé) đi vào Postgres trong một transaction. Worker nền lo các việc chạy sau: nhả vé khi hết giờ giữ, gửi email xác nhận.

## 4. Thành phần hệ thống

| Thành phần | Vai trò |
| --- | --- |
| **Nginx** | Reverse proxy, HTTPS, phục vụ SPA, chuyển tiếp API |
| **API server** | Logic chính: auth, giữ chỗ, xác nhận thanh toán, xuất vé |
| **PostgreSQL** | Nguồn dữ liệu chuẩn; nơi diễn ra transaction giữ/trừ vé |
| **Redis** | Đếm vé còn lại tốc độ cao, khóa giữ chỗ, rate limit |
| **Hàng đợi** | Gửi email, các việc nền sau khi xuất vé |
| **Worker nền** | Nhả vé khi hold hết hạn; gửi email; dọn đơn rác |
| **Payment (giả lập)** | Trả về thành công/thất bại; sau thay bằng cổng thật |
| **SPA (frontend)** | Xem sự kiện, chọn vé, thanh toán, xem vé của mình |

## 5. Mô hình dữ liệu

```sql
events(
  id, name, starts_at, venue, status
)

ticket_types(
  id, event_id, name, price,
  total_qty, sold_qty          -- sold_qty <= total_qty luôn phải đúng
)

orders(
  id, user_id, status,         -- held | pending | paid | expired | cancelled
  total, created_at, expires_at
)

order_items(
  id, order_id, ticket_type_id, qty, unit_price
)

tickets(
  id, order_id, ticket_type_id, code, status  -- issued | checked_in
)
```

Bất biến quan trọng nhất: với mọi `ticket_type`, `sold_qty` (gồm cả vé đang giữ) không bao giờ được vượt `total_qty`. Mọi logic giao dịch xoay quanh việc bảo vệ bất biến này.

## 6. Vòng đời đơn hàng

```
   [Tạo đơn + giữ chỗ]
           |
           v
   +-----------------+   hết giờ (worker)   +-----------+
   |  HELD / PENDING | --------------------> |  EXPIRED  |  -> nhả vé về kho
   | (giữ, chờ trả) |                       +-----------+
   +--------+--------+
  thanh toán OK |
           v
   +-----------------+
   |      PAID       |  -> xuất vé + gửi mã/QR
   +-----------------+
```

Đơn mới tạo ở trạng thái giữ chỗ, có đồng hồ đếm ngược (expires\_at). Trả tiền kịp giờ thì chuyển sang PAID và vé được xuất. Quá giờ không trả thì worker nền chuyển sang EXPIRED và trả số vé về kho để người khác mua được. Đây chính là cơ chế giữ chỗ tạm, chống việc vé bị khóa vĩnh viễn khi ai đó bỏ ngang.

## 7. Chống bán quá vé (overselling)

Đây là phần lõi, quyết định hệ thống đúng hay sai.

**Tình huống:** còn 1 vé, hai người bấm mua cùng lúc. Nếu code ngây thơ (đọc thấy còn 1 rồi cho cả hai mua), bạn bán 2 vé cho 1 chỗ.

**Cách 1 — khóa dòng trong Postgres (dễ hiểu, nên dùng khi học):**

```sql
BEGIN;
-- trừ vé chỉ khi còn đủ; 0 dòng bị ảnh hưởng = hết vé -> ROLLBACK
UPDATE ticket_types
SET sold_qty = sold_qty + :qty
WHERE id = :ttid AND sold_qty + :qty <= total_qty;

-- tạo order trạng thái held + order_items
INSERT INTO orders (...) VALUES (...);
COMMIT;
```

Điều kiện `sold_qty + :qty <= total_qty` là chìa khóa: hai người cùng chạy thì Postgres xếp hàng, người sau thấy hết vé và bị từ chối.

**Cách 2 — bộ đếm nguyên tử trong Redis (nhanh hơn, cho lưu lượng lớn):**

Dùng `DECRBY` trừ số vé còn lại; nếu kết quả âm thì hoàn lại và báo hết. Nhanh vì không đụng DB, nhưng phức tạp hơn vì phải đồng bộ Redis với Postgres.

**Hai nguyên tắc kèm theo:**

- **Giữ chỗ (hold):** vé bị khóa khi bấm mua, có `expires_at`; quá giờ không trả tiền thì worker nhả ra.
- **Idempotency:** mỗi yêu cầu mua/thanh toán mang một mã duy nhất để bấm lại hay mạng lag không tạo đơn hoặc trừ tiền hai lần.

## 8. API endpoints

| Method | Đường dẫn | Mô tả | Auth |
| --- | --- | --- | --- |
| GET | `/api/events` | Danh sách sự kiện | Không |
| GET | `/api/events/:id` | Chi tiết + loại vé còn lại | Không |
| POST | `/api/orders` | Giữ chỗ, tạo đơn (held) | Có |
| POST | `/api/orders/:id/pay` | Thanh toán (giả lập) | Có |
| GET | `/api/orders/:id` | Trạng thái đơn | Có |
| GET | `/api/tickets` | Vé đã mua của mình | Có |

Lưu ý: client chỉ gửi `ticket_type_id` và `qty`; **giá lấy từ server**, không bao giờ tin giá client gửi lên.

## 9. Bảo mật

- **Không tin giá từ client:** giá vé lấy từ DB theo `ticket_type_id`, không nhận số tiền client gửi.
- **Idempotency thanh toán:** dùng idempotency key để không trừ tiền hoặc xuất vé hai lần.
- **Chống bot gom vé:** rate limit theo user và IP; giới hạn số vé mỗi đơn; có thể thêm captcha khi bất thường.
- **Xác thực & phân quyền:** chỉ chủ đơn xem được vé của mình; mã vé khó đoán.
- **Chống giả vé:** mã QR có chữ ký hoặc tra cứu server, không chỉ là một con số.
- **Hạ tầng:** SSH key, firewall, Redis chỉ nghe nội bộ, không commit bí mật.

## 10. Lộ trình triển khai

Làm từ dưới lên, mỗi phase thêm một mắt xích.

1. **Danh mục** — tạo events, ticket\_types; API xem danh sách + vé còn lại.
2. **Giữ chỗ an toàn** — tạo order held bằng transaction + khóa dòng (phần quan trọng nhất).
3. **Thanh toán giả lập** — chuyển held → paid, xuất vé; idempotency.
4. **Worker hết hạn** — nhả vé khi hold quá giờ; trả `sold_qty` về.
5. **Auth** — đăng nhập, gắn đơn với người dùng.
6. **Redis** — cache vé còn lại; (tùy chọn) chuyển đếm vé sang Redis.
7. **Frontend SPA** — xem sự kiện, mua, xem vé.
8. **Deploy** — VPS, Nginx, HTTPS, chạy nền.
9. **Hardening** — rate limit, chống bot, firewall.
10. **(Mở rộng)** — cổng thanh toán thật, chọn ghế, trang quản trị.

## 11. Đánh đổi & câu hỏi cần quyết

Những điểm cần bạn quyết trước khi mình phác code:

- **Giữ chỗ bằng gì:** khóa dòng Postgres (đơn giản, dễ đúng — nên cho bản học) hay bộ đếm Redis (nhanh, phức tạp hơn)?
- **Thời gian giữ chỗ:** 5 hay 10 phút?
- **Thanh toán:** giả lập (tập trung phần lõi) hay cắm cổng thật luôn (phức tạp hơn nhiều)?
- **Loại vé:** vé tự do theo số lượng hay có chọn ghế (khó hơn hẳn)?
- **Ngôn ngữ backend:** Node.js hay Go?

Mặc định mình đề xuất: **khóa dòng Postgres + giữ 10 phút + thanh toán giả lập + vé tự do + Node.js** — nhẹ nhất để đi xuyên phần giao dịch. Bạn thấy hợp thì mình bắt đầu phase 1.
