-- 002: user "app" cho API server — QUYỀN TỐI THIỂU (least privilege)
--
-- Mật khẩu KHÔNG nằm ở đây (file này lên git). Sau khi chạy migration,
-- lệnh db:migrate đặt mật khẩu cho "app" từ biến APP_DB_PASSWORD trong .env.
--
-- app ĐƯỢC:      SELECT, INSERT, UPDATE trên bảng nghiệp vụ
-- app KHÔNG ĐƯỢC: DELETE, TRUNCATE, DROP, ALTER, CREATE TABLE, tạo user,
--                 đụng vào schema_migrations, chạy lệnh hệ điều hành

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app') THEN
    -- Các NO... là mặc định của Postgres, ghi rõ ra cho dễ đọc
    CREATE ROLE app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO app', current_database());
END
$$;

-- Được "nhìn thấy" schema public, nhưng KHÔNG được tạo bảng trong đó
GRANT USAGE ON SCHEMA public TO app;

-- Bảng đang có
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app;

-- Bảng tạo SAU NÀY (migration 003, 004, ...) tự động có cùng bộ quyền trên
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE ON TABLES TO app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app;

-- Sổ ghi nhớ migration là việc của người deploy — app không được đọc/sửa
REVOKE ALL ON schema_migrations FROM app;
