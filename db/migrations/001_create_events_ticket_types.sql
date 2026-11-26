-- 001: bảng sự kiện và loại vé

CREATE TABLE events (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        TEXT        NOT NULL,
  venue       TEXT        NOT NULL,
  starts_at   TIMESTAMPTZ NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'draft'
              CHECK (status IN ('draft', 'on_sale', 'ended', 'cancelled')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ticket_types (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id    BIGINT  NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,                 -- Premium / Gold / Silver / Standard
  price       NUMERIC(12, 0)                    -- VND; NULL = ban tổ chức chưa nhập giá
              CHECK (price IS NULL OR price >= 0),
  total_qty   INTEGER NOT NULL CHECK (total_qty >= 0),
  sold_qty    INTEGER NOT NULL DEFAULT 0 CHECK (sold_qty >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- bất biến quan trọng nhất: không bao giờ bán quá số vé
  CONSTRAINT sold_not_over_total CHECK (sold_qty <= total_qty),
  -- mỗi sự kiện không có 2 loại vé trùng tên
  CONSTRAINT uq_ticket_type_name UNIQUE (event_id, name)
);

CREATE INDEX idx_ticket_types_event ON ticket_types(event_id);
