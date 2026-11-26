import Fastify from "fastify";

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "127.0.0.1"; // chỉ nghe trên máy mình

// logger: true -> in log mỗi request (method, url, status, thời gian)
const app = Fastify({ logger: true });

// Route đầu tiên: kiểm tra server còn sống không
app.get("/health", async () => {
  return { status: "ok", uptime: process.uptime() };
});

try {
  await app.listen({ port: PORT, host: HOST });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
