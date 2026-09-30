-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "seriesId" TEXT,
ADD COLUMN     "seriesTotal" INTEGER,
ALTER COLUMN "durationHours" SET DEFAULT 1,
ALTER COLUMN "durationHours" SET DATA TYPE DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "Cancellation" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "cancelledBy" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "bookingStatus" TEXT NOT NULL,
    "hoursBefore" DOUBLE PRECISION NOT NULL,
    "severity" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cancellation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "tutorId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'TEXT',
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Cancellation_bookingId_key" ON "Cancellation"("bookingId");

-- CreateIndex
CREATE INDEX "Conversation_tutorId_lastMessageAt_idx" ON "Conversation"("tutorId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "Conversation_studentId_lastMessageAt_idx" ON "Conversation"("studentId", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_tutorId_studentId_key" ON "Conversation"("tutorId", "studentId");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "Booking_seriesId_idx" ON "Booking"("seriesId");

-- AddForeignKey
ALTER TABLE "Cancellation" ADD CONSTRAINT "Cancellation_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- This application accesses public tables through server-side Prisma only.
-- Direct Data API roles get no table privileges and no RLS policies.
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "User" FROM PUBLIC, anon, authenticated;
ALTER TABLE "Subject" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "Subject" FROM PUBLIC, anon, authenticated;
ALTER TABLE "TutorSubject" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "TutorSubject" FROM PUBLIC, anon, authenticated;
ALTER TABLE "Booking" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "Booking" FROM PUBLIC, anon, authenticated;
ALTER TABLE "Cancellation" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "Cancellation" FROM PUBLIC, anon, authenticated;
ALTER TABLE "Review" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "Review" FROM PUBLIC, anon, authenticated;
ALTER TABLE "Availability" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "Availability" FROM PUBLIC, anon, authenticated;
ALTER TABLE "Conversation" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "Conversation" FROM PUBLIC, anon, authenticated;
ALTER TABLE "Message" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "Message" FROM PUBLIC, anon, authenticated;
ALTER TABLE "Session" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "Session" FROM PUBLIC, anon, authenticated;

