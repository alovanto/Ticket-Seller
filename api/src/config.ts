// Đọc + kiểm tra toàn bộ cấu hình từ biến môi trường, MỘT lần, lúc khởi động.
// Thiếu biến bắt buộc -> ném lỗi ngay (fail fast), không đợi tới lúc có request.

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(
      `Thiếu biến môi trường ${name}. Kiểm tra file .env ở thư mục gốc (copy từ .env.example).`,
    );
  }
  return value;
}

function optionalInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`Biến môi trường ${name} phải là số nguyên dương, đang là "${raw}".`);
  }
  return n;
}

// Mật khẩu: bắt buộc, đủ dài, và KHÔNG phải giá trị mẫu copy từ .env.example
const MIN_SECRET_LENGTH = 16;
const PLACEHOLDER_MARK = "doi_mat_khau"; // .env.example dùng chữ này cho mọi mật khẩu mẫu

function secret(name: string): string {
  const value = required(name);
  if (value.toLowerCase().includes(PLACEHOLDER_MARK)) {
    throw new Error(`${name} vẫn là mật khẩu MẪU từ .env.example — hãy đặt mật khẩu thật.`);
  }
  if (value.length < MIN_SECRET_LENGTH) {
    throw new Error(`${name} quá ngắn (${value.length} ký tự), cần ít nhất ${MIN_SECRET_LENGTH}.`);
  }
  return value;
}

// Tên user DB của API — phải khớp với db/migrations/002_create_app_role.sql
export const APP_DB_ROLE = "app";

function dbTarget() {
  return {
    host: process.env.POSTGRES_HOST || "127.0.0.1",
    port: optionalInt("POSTGRES_PORT", 5432),
    database: required("POSTGRES_DB"),
  };
}

export const config = {
  server: {
    host: process.env.HOST || "127.0.0.1", // chỉ nghe trên máy mình
    port: optionalInt("PORT", 3000),
  },
  // API kết nối bằng user "app" quyền tối thiểu — KHÔNG cần mật khẩu admin
  db: {
    ...dbTarget(),
    user: APP_DB_ROLE,
    password: secret("APP_DB_PASSWORD"),
  },
} as const;

// Chỉ các lệnh quản trị (db:migrate / db:seed / db:reset) gọi hàm này.
// API server không bao giờ gọi -> tiến trình API không cần biết mật khẩu admin.
export function adminDbConfig() {
  const password = secret("POSTGRES_PASSWORD");
  if (password === config.db.password) {
    throw new Error("APP_DB_PASSWORD phải KHÁC POSTGRES_PASSWORD.");
  }
  return { ...dbTarget(), user: required("POSTGRES_USER"), password };
}
