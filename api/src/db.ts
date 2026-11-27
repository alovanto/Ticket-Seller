import pg from "pg";
import { config } from "./config.ts";

// ---------------------------------------------------------------------------
// Chuyển kiểu dữ liệu Postgres -> JavaScript
//
// Mặc định thư viện pg trả BIGINT (OID 20) và NUMERIC (OID 1700) về dạng CHUỖI,
// vì số của JavaScript chỉ chính xác tới 2^53 - 1 (Number.MAX_SAFE_INTEGER).
// Với dự án này id và giá (VND, NUMERIC(12,0)) luôn nằm trong giới hạn đó, nên
// đổi sang number cho tiện. Nếu lỡ gặp số vượt giới hạn -> báo lỗi chứ không
// lặng lẽ làm sai số.
// ---------------------------------------------------------------------------
function toSafeNumber(text: string): number {
  const n = Number(text);
  if (!Number.isSafeInteger(n)) {
    throw new Error(`Giá trị ${text} vượt giới hạn số an toàn của JavaScript`);
  }
  return n;
}

pg.types.setTypeParser(pg.types.builtins.INT8, toSafeNumber);
pg.types.setTypeParser(pg.types.builtins.NUMERIC, toSafeNumber);

// ---------------------------------------------------------------------------
// Pool: giữ sẵn một nhóm kết nối, các request mượn rồi trả lại.
// ---------------------------------------------------------------------------
export function createPool(connection: pg.PoolConfig): pg.Pool {
  const p = new pg.Pool({
    ...connection,
    max: 10, // tối đa 10 kết nối cùng lúc; request thứ 11 phải xếp hàng chờ
    idleTimeoutMillis: 30_000, // kết nối rảnh quá 30s thì đóng bớt
    connectionTimeoutMillis: 5_000, // chờ mượn kết nối quá 5s thì báo lỗi, không treo mãi
  });

  // Một kết nối đang rảnh trong pool bị lỗi (vd: Postgres khởi động lại).
  // Không bắt sự kiện này thì cả tiến trình Node sẽ bị sập.
  p.on("error", (err) => {
    console.error("Lỗi trên kết nối rảnh trong pool:", err.message);
  });
  return p;
}

// Pool của API — đăng nhập bằng user "app" (quyền tối thiểu)
export const pool = createPool(config.db);

// Gọi lúc khởi động: thử một câu SQL đơn giản để chắc chắn kết nối được.
export async function checkDbConnection(): Promise<void> {
  const { rows } = await pool.query<{ version: string; user: string }>(
    "SELECT version() AS version, current_user AS user",
  );
  const row = rows[0];
  console.log(`Đã kết nối Postgres (user: ${row?.user}):`, row?.version.split(" on ")[0]);
}
