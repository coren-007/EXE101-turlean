-- AlterTable
ALTER TABLE "ClassSession" ADD COLUMN     "makeupForId" TEXT;

-- CreateTable
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassFeePayment" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "studentParentId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'CASH',
    "note" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassFeePayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Holiday_date_key" ON "Holiday"("date");

-- CreateIndex
CREATE INDEX "ClassFeePayment_classId_idx" ON "ClassFeePayment"("classId");

-- CreateIndex
CREATE INDEX "ClassFeePayment_studentParentId_idx" ON "ClassFeePayment"("studentParentId");

-- CreateIndex
CREATE UNIQUE INDEX "ClassFeePayment_classId_enrollmentId_period_key" ON "ClassFeePayment"("classId", "enrollmentId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "ClassSession_makeupForId_key" ON "ClassSession"("makeupForId");

-- AddForeignKey
ALTER TABLE "ClassSession" ADD CONSTRAINT "ClassSession_makeupForId_fkey" FOREIGN KEY ("makeupForId") REFERENCES "ClassSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassFeePayment" ADD CONSTRAINT "ClassFeePayment_classId_fkey" FOREIGN KEY ("classId") REFERENCES "GroupClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassFeePayment" ADD CONSTRAINT "ClassFeePayment_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "ClassEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassFeePayment" ADD CONSTRAINT "ClassFeePayment_studentParentId_fkey" FOREIGN KEY ("studentParentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

