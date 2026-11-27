// npm run db:reset — XÓA SẠCH DB dev, chạy lại toàn bộ migration từ 001, rồi seed.
// Dùng khi DB dev bị rối, hoặc để chắc chắn các migration dựng được DB từ con số 0.
import path from "node:path";
import { pool } from "../src/db.ts";
import { migrate, readSqlFile } from "./lib/migrator.ts";
import { assertDevOnly } from "./lib/guard.ts";

const SEED_FILE = path.resolve(import.meta.dirname, "../../db/seed.sql");

const client = await pool.connect();
try {
  assertDevOnly("db:reset");

  console.log("→ Xóa toàn bộ bảng (DROP SCHEMA public)");
  await client.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");

  await migrate(client);

  await client.query(await readSqlFile(SEED_FILE));
  console.log("✓ Đã seed dữ liệu thử");
} catch (err) {
  console.error("❌", (err as Error).message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
