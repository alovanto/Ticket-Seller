// npm run db:seed — xóa dữ liệu thử cũ, đổ lại từ db/seed.sql. CHỈ dùng cho dev.
// Đăng nhập bằng user ADMIN: seed cần TRUNCATE, mà user "app" không có quyền đó.
import path from "node:path";
import { adminDbConfig } from "../src/config.ts";
import { createPool } from "../src/db.ts";
import { assertDevOnly } from "./lib/guard.ts";
import { readSqlFile } from "./lib/migrator.ts";

const SEED_FILE = path.resolve(import.meta.dirname, "../../db/seed.sql");

async function main() {
  assertDevOnly("db:seed");
  const adminPool = createPool(adminDbConfig());
  try {
    await adminPool.query(await readSqlFile(SEED_FILE));
    console.log("✓ Đã seed dữ liệu thử từ db/seed.sql");
  } finally {
    await adminPool.end();
  }
}

try {
  await main();
} catch (err) {
  const message = (err as Error).message;
  console.error("❌", message);
  if (message.includes("does not exist")) {
    console.error("   Thiếu bảng — chạy npm run db:migrate trước.");
  }
  process.exitCode = 1;
}
