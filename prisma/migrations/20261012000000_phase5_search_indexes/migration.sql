-- Phase 5: index cho truy vấn tìm kiếm gia sư
-- (where role='TUTOR' + city + hourlyRate range; lọc khung giờ theo Availability)

-- CreateIndex
CREATE INDEX "User_role_city_idx" ON "User"("role", "city");

-- CreateIndex
CREATE INDEX "User_hourlyRate_idx" ON "User"("hourlyRate");

-- CreateIndex
CREATE INDEX "Availability_tutorId_dayOfWeek_idx" ON "Availability"("tutorId", "dayOfWeek");
