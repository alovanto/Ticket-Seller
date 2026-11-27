import Fastify from "fastify";
import { config } from "./config.ts";
import { pool, checkDbConnection } from "./db.ts";
import { eventRoutes } from "./routes/events.ts";

// logger: true -> in log mỗi request (method, url, status, thời gian)
const app = Fastify({ logger: true });

// LIVENESS — "tiến trình Node còn chạy không?"
// Cố tình KHÔNG kiểm tra DB: nếu DB sập mà /health báo lỗi, hệ thống giám sát
// sẽ restart API liên tục, nhưng restart API không chữa được DB.
app.get("/health", async () => {
  return { status: "ok", uptime: process.uptime() };
});

// READINESS — "có phục vụ khách được không?" (cần DB trả lời được)
// Lỗi -> 503: báo tạm ngừng gửi khách vào, KHÔNG phải restart.
app.get("/ready", async (request, reply) => {
  try {
    await pool.query("SELECT 1");
    return { status: "ready", db: "ok" };
  } catch (err) {
    // Chi tiết lỗi chỉ ghi log, không trả cho client
    request.log.warn({ err }, "Readiness: database không phản hồi");
    return reply.code(503).send({ status: "not_ready", db: "down" });
  }
});

// ---------------------------------------------------------------------------
// Mọi lỗi đều trả về CÙNG MỘT định dạng: { error: { code, message } }
//
// QUAN TRỌNG: phải đặt TRƯỚC app.register(...). Mỗi plugin Fastify chụp lại
// bộ xử lý lỗi của cha ngay lúc được register; đặt sau thì route bên trong
// plugin vẫn dùng bộ xử lý mặc định (và làm lộ chi tiết lỗi nội bộ).
// ---------------------------------------------------------------------------

// Lỗi xảy ra trong lúc xử lý request
app.setErrorHandler((err: Error & { validation?: unknown; statusCode?: number }, request, reply) => {
  // Dữ liệu gửi lên sai (vd: /api/events/abc) -> 400, nói rõ sai ở đâu
  if (err.validation) {
    return reply.code(400).send({
      error: { code: "VALIDATION_ERROR", message: err.message },
    });
  }

  // Lỗi bất ngờ (vd: mất kết nối DB) -> 500. Chi tiết CHỈ ghi vào log,
  // không gửi cho client vì có thể lộ tên bảng, câu SQL, cấu hình nội bộ.
  const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
  if (status >= 500) {
    request.log.error(err);
    return reply.code(500).send({
      error: { code: "INTERNAL_ERROR", message: "Lỗi máy chủ, vui lòng thử lại sau" },
    });
  }
  return reply.code(status).send({ error: { code: "REQUEST_ERROR", message: err.message } });
});

// Gọi vào đường dẫn không tồn tại (vd: /api/abc)
app.setNotFoundHandler((request, reply) => {
  return reply.code(404).send({
    error: { code: "ROUTE_NOT_FOUND", message: `Không có đường dẫn ${request.method} ${request.url}` },
  });
});

// Đăng ký route SAU khi đã cài bộ xử lý lỗi (xem giải thích ở trên)
await app.register(eventRoutes);

// Tắt đàng hoàng khi bấm Ctrl+C (SIGINT) hoặc khi hệ thống yêu cầu dừng (SIGTERM):
// 1) app.close(): ngừng nhận request mới, chờ request đang chạy xong
// 2) pool.end(): trả hết kết nối về cho Postgres
async function shutdown(signal: string) {
  app.log.info(`Nhận ${signal}, đang tắt server...`);
  try {
    await app.close();
    await pool.end();
    process.exit(0);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  // Database chưa sẵn sàng -> dừng ngay, không mở cổng nhận request
  await checkDbConnection();
  await app.listen({ host: config.server.host, port: config.server.port });
} catch (err) {
  app.log.error(err);
  await pool.end().catch(() => {});
  process.exit(1);
}
