-- Phase 6 — Admin & Trust: xác minh bằng cấp (VerificationRequest) + tự khóa tài khoản
-- Chạy bằng `prisma migrate deploy` trên PostgreSQL production (Supabase/Neon/Vercel Postgres).
-- Sandbox dev dùng `prisma db push` (SQLite) — không cần file này.

-- Tài khoản bị khóa do điểm tin cậy thấp (< 30) — admin mở khóa được
ALTER TABLE "User" ADD COLUMN "lockedAt" TIMESTAMP;
ALTER TABLE "User" ADD COLUMN "lockedReason" TEXT;

-- Yêu cầu xác minh bằng cấp của gia sư (file ảnh/PDF ≤ 5MB lưu trong DB)
CREATE TABLE "VerificationRequest" (
    "id" TEXT NOT NULL,
    "tutorId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "fileData" BYTEA NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VerificationRequest_status_createdAt_idx" ON "VerificationRequest"("status", "createdAt");
CREATE INDEX "VerificationRequest_tutorId_idx" ON "VerificationRequest"("tutorId");

-- AddForeignKey
ALTER TABLE "VerificationRequest" ADD CONSTRAINT "VerificationRequest_tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VerificationRequest" ADD CONSTRAINT "VerificationRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
