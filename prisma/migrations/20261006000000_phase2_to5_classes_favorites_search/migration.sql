-- CreateTable
CREATE TABLE "Favorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tutorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupClass" (
    "id" TEXT NOT NULL,
    "tutorId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "gradeLevel" TEXT,
    "description" TEXT,
    "meetingType" TEXT NOT NULL DEFAULT 'AT_TUTOR_HOME',
    "address" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 8,
    "monthlyFee" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "startDate" TEXT,
    "enrollDeadline" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassScheduleSlot" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,

    CONSTRAINT "ClassScheduleSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassEnrollment" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "studentParentId" TEXT NOT NULL,
    "studentName" TEXT,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassSession" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "note" TEXT,
    "makeupForId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassAttendance" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "studentParentId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "markedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassAttendance_pkey" PRIMARY KEY ("id")
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
CREATE INDEX "Favorite_userId_idx" ON "Favorite"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Favorite_userId_tutorId_key" ON "Favorite"("userId", "tutorId");

-- CreateIndex
CREATE UNIQUE INDEX "Holiday_date_key" ON "Holiday"("date");

-- CreateIndex
CREATE INDEX "GroupClass_tutorId_idx" ON "GroupClass"("tutorId");

-- CreateIndex
CREATE INDEX "ClassScheduleSlot_classId_idx" ON "ClassScheduleSlot"("classId");

-- CreateIndex
CREATE INDEX "ClassEnrollment_classId_idx" ON "ClassEnrollment"("classId");

-- CreateIndex
CREATE INDEX "ClassEnrollment_studentParentId_idx" ON "ClassEnrollment"("studentParentId");

-- CreateIndex
CREATE UNIQUE INDEX "ClassEnrollment_classId_studentParentId_key" ON "ClassEnrollment"("classId", "studentParentId");

-- CreateIndex
CREATE UNIQUE INDEX "ClassSession_makeupForId_key" ON "ClassSession"("makeupForId");

-- CreateIndex
CREATE INDEX "ClassSession_classId_date_idx" ON "ClassSession"("classId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ClassSession_classId_date_startTime_key" ON "ClassSession"("classId", "date", "startTime");

-- CreateIndex
CREATE INDEX "ClassAttendance_studentParentId_idx" ON "ClassAttendance"("studentParentId");

-- CreateIndex
CREATE UNIQUE INDEX "ClassAttendance_sessionId_studentParentId_key" ON "ClassAttendance"("sessionId", "studentParentId");

-- CreateIndex
CREATE INDEX "ClassFeePayment_classId_idx" ON "ClassFeePayment"("classId");

-- CreateIndex
CREATE INDEX "ClassFeePayment_studentParentId_idx" ON "ClassFeePayment"("studentParentId");

-- CreateIndex
CREATE UNIQUE INDEX "ClassFeePayment_classId_enrollmentId_period_key" ON "ClassFeePayment"("classId", "enrollmentId", "period");

-- CreateIndex
CREATE INDEX "User_role_city_idx" ON "User"("role", "city");

-- CreateIndex
CREATE INDEX "User_hourlyRate_idx" ON "User"("hourlyRate");

-- CreateIndex
CREATE INDEX "Availability_tutorId_dayOfWeek_idx" ON "Availability"("tutorId", "dayOfWeek");

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupClass" ADD CONSTRAINT "GroupClass_tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupClass" ADD CONSTRAINT "GroupClass_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassScheduleSlot" ADD CONSTRAINT "ClassScheduleSlot_classId_fkey" FOREIGN KEY ("classId") REFERENCES "GroupClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassEnrollment" ADD CONSTRAINT "ClassEnrollment_classId_fkey" FOREIGN KEY ("classId") REFERENCES "GroupClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassEnrollment" ADD CONSTRAINT "ClassEnrollment_studentParentId_fkey" FOREIGN KEY ("studentParentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSession" ADD CONSTRAINT "ClassSession_classId_fkey" FOREIGN KEY ("classId") REFERENCES "GroupClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSession" ADD CONSTRAINT "ClassSession_makeupForId_fkey" FOREIGN KEY ("makeupForId") REFERENCES "ClassSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassAttendance" ADD CONSTRAINT "ClassAttendance_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ClassSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassAttendance" ADD CONSTRAINT "ClassAttendance_studentParentId_fkey" FOREIGN KEY ("studentParentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassFeePayment" ADD CONSTRAINT "ClassFeePayment_classId_fkey" FOREIGN KEY ("classId") REFERENCES "GroupClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassFeePayment" ADD CONSTRAINT "ClassFeePayment_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "ClassEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassFeePayment" ADD CONSTRAINT "ClassFeePayment_studentParentId_fkey" FOREIGN KEY ("studentParentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GroupClass" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "GroupClass" FROM PUBLIC, anon, authenticated;

ALTER TABLE "ClassScheduleSlot" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "ClassScheduleSlot" FROM PUBLIC, anon, authenticated;

ALTER TABLE "ClassEnrollment" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "ClassEnrollment" FROM PUBLIC, anon, authenticated;

ALTER TABLE "ClassSession" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "ClassSession" FROM PUBLIC, anon, authenticated;

ALTER TABLE "ClassAttendance" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "ClassAttendance" FROM PUBLIC, anon, authenticated;

ALTER TABLE "ClassFeePayment" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "ClassFeePayment" FROM PUBLIC, anon, authenticated;

ALTER TABLE "Favorite" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "Favorite" FROM PUBLIC, anon, authenticated;

ALTER TABLE "Holiday" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "Holiday" FROM PUBLIC, anon, authenticated;

