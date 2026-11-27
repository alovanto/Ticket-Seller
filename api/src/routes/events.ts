import type { FastifyPluginAsync } from "fastify";
import { pool } from "../db.ts";

// Kiểu dữ liệu của từng dòng trả về từ SQL (giúp TypeScript kiểm tra khi dùng)
type EventRow = {
  id: number;
  name: string;
  venue: string;
  starts_at: Date; // pg tự đổi TIMESTAMPTZ -> Date; khi trả JSON sẽ thành chuỗi ISO (giờ UTC)
  status: string;
};

type TicketTypeRow = {
  id: number;
  name: string;
  price: number | null; // null = ban tổ chức chưa nhập giá
  total_qty: number;
  available_qty: number;
};

export const eventRoutes: FastifyPluginAsync = async (app) => {
  // -------------------------------------------------------------------------
  // GET /api/events — danh sách sự kiện ĐANG MỞ BÁN, sắp diễn ra trước
  // -------------------------------------------------------------------------
  app.get("/api/events", async () => {
    const { rows } = await pool.query<EventRow>(
      `SELECT id, name, venue, starts_at, status
         FROM events
        WHERE status = 'on_sale'
        ORDER BY starts_at, id`,
    );
    return { events: rows };
  });

  // -------------------------------------------------------------------------
  // GET /api/events/:id — chi tiết một sự kiện + số vé còn lại của từng loại
  // -------------------------------------------------------------------------
  app.get<{ Params: { id: number } }>(
    "/api/events/:id",
    {
      // Fastify kiểm tra :id TRƯỚC khi vào handler; sai thì tự trả 400
      schema: {
        params: {
          type: "object",
          // maximum = Number.MAX_SAFE_INTEGER: số lớn hơn JS không giữ chính xác được
          // và có thể vượt BIGINT của Postgres -> chặn ngay ở cửa (400), không để chạm DB
          properties: { id: { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER } },
          required: ["id"],
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;

      // $1 là tham số: giá trị gửi riêng cho Postgres, không ghép vào chuỗi SQL
      // -> chống SQL injection
      const eventResult = await pool.query<EventRow>(
        `SELECT id, name, venue, starts_at, status
           FROM events
          WHERE id = $1 AND status = 'on_sale'`,
        [id],
      );
      const event = eventResult.rows[0];

      // Không có HOẶC đang là nháp -> đều trả 404, không để lộ sự kiện nháp có tồn tại
      if (!event) {
        return reply.code(404).send({
          error: { code: "EVENT_NOT_FOUND", message: "Không tìm thấy sự kiện" },
        });
      }

      const ticketResult = await pool.query<TicketTypeRow>(
        `SELECT id, name, price, total_qty,
                total_qty - sold_qty AS available_qty
           FROM ticket_types
          WHERE event_id = $1
          ORDER BY price DESC NULLS LAST, id`,
        [id],
      );

      return { event: { ...event, ticket_types: ticketResult.rows } };
    },
  );
};
