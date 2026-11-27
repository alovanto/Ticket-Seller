// npm run db:migrate — chạy các migration chưa chạy, rồi đặt mật khẩu cho user "app".
// Đăng nhập bằng user ADMIN (chủ các bảng). An toàn trên mọi môi trường.
import { adminDbConfig, APP_DB_ROLE, config } from "../src/config.ts";
import { createPool } from "../src/db.ts";
import { migrate, syncAppRolePassword } from "./lib/migrator.ts";

async function main() {
  const adminPool = createPool(adminDbConfig());
  const client = await adminPool.connect();
  try {
    await migrate(client);
    await syncAppRolePassword(client, APP_DB_ROLE, config.db.password);
    console.log(`✓ Đã đặt mật khẩu cho user "${APP_DB_ROLE}" từ APP_DB_PASSWORD`);
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
