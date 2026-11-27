// Bộ chạy migration: chạy LẦN LƯỢT các file db/migrations/NNN_*.sql chưa chạy,
// ghi lại vào bảng schema_migrations kèm checksum để phát hiện file bị sửa/mất.
import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import type { PoolClient } from "pg";

// api/scripts/lib -> ../../.. = thư mục gốc project
export const MIGRATIONS_DIR = path.resolve(import.meta.dirname, "../../../db/migrations");

// Tên hợp lệ: 3 chữ số + "_" + chữ thường/số/gạch dưới, vd 002_create_orders.sql
const FILE_PATTERN = /^\d{3}_[a-z0-9_]+\.sql$/;

// Khóa riêng của app trong Postgres: 2 lệnh migrate chạy cùng lúc (vd 2 server
// cùng deploy) thì lệnh sau phải CHỜ lệnh trước xong, không chạy chồng lên nhau.
const LOCK_KEY = 727_001;

type MigrationFile = { name: string; sql: string; checksum: string };

// Đọc file SQL và bỏ ký tự BOM (﻿) ở đầu file nếu có. Một số editor/PowerShell
// trên Windows tự chèn BOM khi lưu UTF-8; Postgres không hiểu -> báo lỗi cú pháp.
export async function readSqlFile(file: string): Promise<string> {
  const text = await readFile(file, "utf8");
  return text.startsWith("﻿") ? text.slice(1) : text;
}

// Bỏ khác biệt xuống dòng Windows (\r\n) / Linux (\n) trước khi băm,
// nếu không cùng một file clone trên 2 hệ điều hành sẽ ra 2 checksum khác nhau.
function checksumOf(sql: string): string {
  return createHash("sha256").update(sql.replace(/\r\n/g, "\n")).digest("hex");
}

async function loadMigrationFiles(): Promise<MigrationFile[]> {
  const names = (await readdir(MIGRATIONS_DIR)).filter((n) => n.endsWith(".sql")).sort();

  const badNames = names.filter((n) => !FILE_PATTERN.test(n));
  if (badNames.length > 0) {
    throw new Error(
      `Tên file migration sai mẫu "001_ten_viet_thuong.sql": ${badNames.join(", ")}`,
    );
  }

  const numbers = names.map((n) => n.slice(0, 3));
  const duplicate = numbers.find((num, i) => numbers.indexOf(num) !== i);
  if (duplicate) {
    throw new Error(`Có 2 file migration trùng số thứ tự ${duplicate}`);
  }

  return Promise.all(
    names.map(async (name) => {
      const sql = await readSqlFile(path.join(MIGRATIONS_DIR, name));
      return { name, sql, checksum: checksumOf(sql) };
    }),
  );
}

export async function migrate(client: PoolClient, log: (msg: string) => void = console.log) {
  await client.query("SELECT pg_advisory_lock($1)", [LOCK_KEY]);
  try {
    // Bảng "sổ ghi nhớ": file nào đã chạy, checksum lúc chạy, chạy lúc nào
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name       TEXT PRIMARY KEY,
        checksum   TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);

    const files = await loadMigrationFiles();
    const { rows: applied } = await client.query<{ name: string; checksum: string }>(
      "SELECT name, checksum FROM schema_migrations ORDER BY name",
    );

    // Kiểm tra 1: DB ghi là đã chạy, nhưng file không còn -> dừng
    const fileNames = new Set(files.map((f) => f.name));
    const missing = applied.filter((a) => !fileNames.has(a.name)).map((a) => a.name);
    if (missing.length > 0) {
      throw new Error(
        `DB ghi là đã chạy nhưng KHÔNG tìm thấy file: ${missing.join(", ")}. ` +
          `Khôi phục file từ git trước khi migrate.`,
      );
    }

    // Kiểm tra 2: file đã chạy nhưng nội dung bị sửa sau đó -> dừng
    const appliedChecksum = new Map(applied.map((a) => [a.name, a.checksum]));
    for (const f of files) {
      const old = appliedChecksum.get(f.name);
      if (old !== undefined && old !== f.checksum) {
        throw new Error(
          `File ${f.name} đã bị SỬA sau khi chạy (checksum khác). ` +
            `Không sửa migration cũ — hãy tạo file migration mới.`,
        );
      }
    }

    const pending = files.filter((f) => !appliedChecksum.has(f.name));

    // Kiểm tra 3: file mới nhưng số thứ tự NHỎ HƠN file đã chạy cuối cùng -> dừng
    const lastApplied = applied.at(-1)?.name;
    const outOfOrder = lastApplied ? pending.filter((f) => f.name < lastApplied) : [];
    if (outOfOrder.length > 0) {
      throw new Error(
        `File ${outOfOrder.map((f) => f.name).join(", ")} có số thứ tự nhỏ hơn ` +
          `${lastApplied} (đã chạy). Đổi sang số lớn hơn.`,
      );
    }

    if (pending.length === 0) {
      log("Không có migration mới — DB đã ở phiên bản mới nhất.");
      return;
    }

    // Chạy từng file trong 1 transaction riêng: lỗi -> ROLLBACK sạch, dừng luôn
    for (const f of pending) {
      log(`→ Đang chạy ${f.name}`);
      try {
        await client.query("BEGIN");
        await client.query(f.sql);
        await client.query("INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)", [
          f.name,
          f.checksum,
        ]);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(
          `Migration ${f.name} lỗi -> đã ROLLBACK, dừng lại (các file sau chưa chạy). ` +
            `Chi tiết: ${(err as Error).message}`,
          { cause: err },
        );
      }
      log(`  ✓ ${f.name}`);
    }
    log(`Xong: đã chạy ${pending.length} migration.`);
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]);
  }
}
