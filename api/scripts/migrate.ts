// npm run db:migrate — chạy các migration chưa chạy. An toàn trên mọi môi trường.
import { pool } from "../src/db.ts";
import { migrate } from "./lib/migrator.ts";

const client = await pool.connect();
try {
  await migrate(client);
} catch (err) {
  console.error("❌", (err as Error).message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
