// npm run db:seed — xóa dữ liệu thử cũ, đổ lại từ db/seed.sql. CHỈ dùng cho dev.
import path from "node:path";
import { pool } from "../src/db.ts";
import { assertDevOnly } from "./lib/guard.ts";
import { readSqlFile } from "./lib/migrator.ts";

const SEED_FILE = path.resolve(import.meta.dirname, "../../db/seed.sql");

try {
  assertDevOnly("db:seed");
  await pool.query(await readSqlFile(SEED_FILE));
  console.log("✓ Đã seed dữ liệu thử từ db/seed.sql");
} catch (err) {
  const message = (err as Error).message;
  console.error("❌", message);
  if (message.includes("does not exist")) {
    console.error("   Thiếu bảng — chạy npm run db:migrate trước.");
  }
  process.exitCode = 1;
} finally {
  await pool.end();
}
