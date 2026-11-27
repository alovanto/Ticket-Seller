// npm run db:reset — XÓA SẠCH DB dev, chạy lại toàn bộ migration từ 001, rồi seed.
// Dùng khi DB dev bị rối, hoặc để chắc chắn các migration dựng được DB từ con số 0.
// Đăng nhập bằng user ADMIN.
import path from "node:path";
import { adminDbConfig, APP_DB_ROLE, config } from "../src/config.ts";
import { createPool } from "../src/db.ts";
import { migrate, readSqlFile, syncAppRolePassword } from "./lib/migrator.ts";
import { assertDevOnly } from "./lib/guard.ts";

const SEED_FILE = path.resolve(import.meta.dirname, "../../db/seed.sql");

async function main() {
  assertDevOnly("db:reset");
  const adminPool = createPool(adminDbConfig());
  const client = await adminPool.connect();
  try {
    console.log("→ Xóa toàn bộ bảng (DROP SCHEMA public)");
    await client.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");

    await migrate(client);
    await syncAppRolePassword(client, APP_DB_ROLE, config.db.password);

    await client.query(await readSqlFile(SEED_FILE));
    console.log("✓ Đã seed dữ liệu thử");
  } finally {
    client.release();
    await adminPool.end();
  }
}

try {
  await main();
} catch (err) {
  console.error("❌", (err as Error).message);
  process.exitCode = 1;
}
