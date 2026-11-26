-- Dữ liệu thử. Chạy lại bao nhiêu lần cũng được: xóa sạch rồi đổ lại.
BEGIN;

TRUNCATE ticket_types, events RESTART IDENTITY CASCADE;

-- 2 sự kiện đang mở bán + 1 sự kiện nháp (để kiểm tra API không lộ sự kiện nháp)
INSERT INTO events (name, venue, starts_at, status) VALUES
  ('Rock Night 2026',  'Sân vận động Mỹ Đình, Hà Nội',     '2026-12-20 19:00+07', 'on_sale'),
  ('Acoustic Chill',   'Nhà hát Hòa Bình, TP.HCM',         '2026-12-27 20:00+07', 'on_sale'),
  ('Tech Conf Hà Nội', 'Trung tâm Hội nghị Quốc gia',      '2027-01-10 08:00+07', 'draft');

-- 4 loại vé cho mỗi sự kiện; price để NULL, ban tổ chức sẽ nhập sau
INSERT INTO ticket_types (event_id, name, total_qty)
SELECT e.id, t.name, t.qty
FROM events e
CROSS JOIN (VALUES
  ('Premium',   20),
  ('Gold',      50),
  ('Silver',   100),
  ('Standard', 200)
) AS t(name, qty);

COMMIT;
