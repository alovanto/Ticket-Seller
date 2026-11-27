// Chặn các lệnh xóa/ghi đè dữ liệu (seed, reset) chạy nhầm trên production.
export function assertDevOnly(commandName: string): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error(`Lệnh "${commandName}" XÓA dữ liệu — không được chạy khi NODE_ENV=production.`);
  }
}
