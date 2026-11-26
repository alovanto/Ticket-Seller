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

export const config = {
  server: {
    host: process.env.HOST || "127.0.0.1", // chỉ nghe trên máy mình
    port: optionalInt("PORT", 3000),
  },
  db: {
    host: process.env.POSTGRES_HOST || "127.0.0.1",
    port: optionalInt("POSTGRES_PORT", 5432),
    user: required("POSTGRES_USER"),
    password: required("POSTGRES_PASSWORD"),
    database: required("POSTGRES_DB"),
  },
} as const;
