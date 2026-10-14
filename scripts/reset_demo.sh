#!/bin/bash
# Reset dữ liệu demo về trạng thái CHUẨN (có lịch sử 5 tuần) — chạy trước test_phase3
# để test idempotent. Lưu ý: xóa toàn bộ buổi học/điểm danh/học phí rồi sinh lại.
set -e
cd /home/z/my-project

echo '=== 1/3. Reset mốc thời gian (startDate 5 tuần trước) ==='
bunx tsx scripts/fix_demo_history.ts

echo '=== 2/3. Backfill buổi học + điểm danh + danh sách chờ ==='
bunx tsx scripts/backfill_sessions.ts

echo '=== 3/3. Seed ngày lễ + sổ học phí demo ==='
bunx tsx scripts/seed_phase3.ts

echo '=== DONE — dữ liệu demo đã reset về chuẩn ==='
