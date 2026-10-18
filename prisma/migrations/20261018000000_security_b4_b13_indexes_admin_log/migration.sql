-- Security fixes B4-B13 + hiệu năng C1 (audit toàn diện thứ 2)
-- Chạy bằng `prisma migrate deploy` trên PostgreSQL production.
-- Sandbox dev dùng `prisma db push` (SQLite) — không cần file này.

-- C1: index nóng cho booking conflict-check + cron
CREATE INDEX "Booking_tutorId_date_idx" ON "Booking"("tutorId", "date");
CREATE INDEX "Booking_studentId_date_idx" ON "Booking"("studentId", "date");
CREATE INDEX "Booking_date_status_idx" ON "Booking"("date", "status");

-- B13: nhật ký thao tác quản trị (unlock/duyệt xác minh...)
CREATE TABLE "AdminActionLog" (
    "id" TEXT NOT NULL,
    "adminId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "meta" TEXT,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminActionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminActionLog_adminId_idx" ON "AdminActionLog"("adminId");
CREATE INDEX "AdminActionLog_createdAt_idx" ON "AdminActionLog"("createdAt");
CREATE INDEX "AdminActionLog_action_idx" ON "AdminActionLog"("action");

-- AddForeignKey
ALTER TABLE "AdminActionLog" ADD CONSTRAINT "AdminActionLog_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
