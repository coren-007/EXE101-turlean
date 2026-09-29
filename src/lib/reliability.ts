// ============================================================
// Reliability Score — hệ thống điểm tin cậy (P0-1)
// Mọi lần hủy lịch đều được ghi vào model Cancellation kèm
// mức độ vi phạm & số điểm trừ. Điểm khởi đầu 100, trừ dần.
// ============================================================
import { db } from './db'

export type Severity = 'NONE' | 'MINOR' | 'WARNING' | 'VIOLATION' | 'SEVERE'
export type Role = 'TUTOR' | 'STUDENT'
export type BookingStatus = 'PENDING' | 'CONFIRMED'

export interface SeverityRule {
  severity: Severity
  points: number
  label: string // mô tả tiếng Việt hiển thị cho user
}

export const RELIABILITY_TIERS = [
  { min: 90, key: 'EXCELLENT', label: 'Xuất sắc', color: 'emerald' },
  { min: 70, key: 'GOOD', label: 'Tốt', color: 'blue' },
  { min: 50, key: 'AVERAGE', label: 'Trung bình', color: 'amber' },
  { min: 0, key: 'POOR', label: 'Cần cải thiện', color: 'rose' },
] as const

export const BASE_SCORE = 100

/**
 * Phân loại mức độ vi phạm khi hủy lịch.
 * Nguyên tắc: hủy càng sát giờ học + đã được xác nhận → phạt càng nặng.
 * Gia sư hủy CONFIRMED nặng hơn học sinh (gia sư là bên cung cấp dịch vụ).
 */
export function classifyCancellation(
  cancelledBy: Role,
  bookingStatus: BookingStatus,
  hoursBefore: number,
): SeverityRule {
  // Hủy khi chưa được xác nhận — gánh nặng nhẹ
  if (bookingStatus === 'PENDING') {
    if (hoursBefore >= 24) return { severity: 'NONE', points: 0, label: 'Hủy sớm (chưa xác nhận)' }
    return { severity: 'MINOR', points: 5, label: 'Hủy trong 24h (chưa xác nhận)' }
  }

  // Hủy lịch ĐÃ XÁC NHẬN
  if (cancelledBy === 'TUTOR') {
    if (hoursBefore < 2)
      return { severity: 'SEVERE', points: 20, label: 'Gia sư hủy sát giờ (<2h)' }
    if (hoursBefore < 24)
      return { severity: 'VIOLATION', points: 15, label: 'Gia sư hủy trong 24h' }
    return { severity: 'WARNING', points: 10, label: 'Gia sư hủy trước 24h' }
  }

  // STUDENT hủy lịch đã xác nhận
  if (hoursBefore < 2)
    return { severity: 'VIOLATION', points: 15, label: 'Học sinh hủy sát giờ (<2h)' }
  if (hoursBefore < 24)
    return { severity: 'WARNING', points: 10, label: 'Học sinh hủy trong 24h' }
  return { severity: 'MINOR', points: 5, label: 'Học sinh hủy trước 24h' }
}

export function tierForScore(score: number) {
  return RELIABILITY_TIERS.find(t => score >= t.min) ?? RELIABILITY_TIERS[RELIABILITY_TIERS.length - 1]
}

export interface ReliabilitySummary {
  userId: string
  score: number
  tier: { key: string; label: string; color: string; min: number }
  totalCancellations: number
  violations: number // VIOLATION + SEVERE
  warnings: number // WARNING + MINOR
  lastCancellationAt: string | null
}

/**
 * Tính điểm tin cậy của một user từ lịch sử hủy lịch.
 * score = max(0, 100 - tổng điểm trừ)
 */
export async function computeReliability(userId: string): Promise<ReliabilitySummary> {
  const cancellations = await db.cancellation.findMany({
    where: { booking: { OR: [{ tutorId: userId }, { studentId: userId }] } },
    include: { booking: { select: { tutorId: true, studentId: true } } },
    orderBy: { createdAt: 'desc' },
  })

  // Chỉ tính những lần hủy do CHÍNH user này thực hiện
  const own = cancellations.filter(c => {
    const isTutorSide = c.booking.tutorId === userId
    return isTutorSide ? c.cancelledBy === 'TUTOR' : c.cancelledBy === 'STUDENT'
  })

  const totalPoints = own.reduce((s, c) => s + c.points, 0)
  const score = Math.max(0, BASE_SCORE - totalPoints)
  const violations = own.filter(c => c.severity === 'VIOLATION' || c.severity === 'SEVERE').length
  const warnings = own.filter(c => c.severity === 'WARNING' || c.severity === 'MINOR').length

  return {
    userId,
    score,
    tier: tierForScore(score),
    totalCancellations: own.length,
    violations,
    warnings,
    lastCancellationAt: own[0]?.createdAt?.toISOString() ?? null,
  }
}

/**
 * Tính điểm tin cậy cho NHIỀU user cùng lúc (dùng cho trang tìm kiếm).
 * Trả về Map<userId, ReliabilitySummary> để tránh N+1 query.
 */
export async function computeReliabilityBulk(userIds: string[]): Promise<Map<string, ReliabilitySummary>> {
  const result = new Map<string, ReliabilitySummary>()
  if (userIds.length === 0) return result

  const cancellations = await db.cancellation.findMany({
    where: { booking: { OR: [{ tutorId: { in: userIds } }, { studentId: { in: userIds } }] } },
    include: { booking: { select: { tutorId: true, studentId: true } } },
    orderBy: { createdAt: 'desc' },
  })

  for (const userId of userIds) {
    const own = cancellations.filter(c => {
      const isTutorSide = c.booking.tutorId === userId
      return isTutorSide ? c.cancelledBy === 'TUTOR' : c.cancelledBy === 'STUDENT'
    })
    const totalPoints = own.reduce((s, c) => s + c.points, 0)
    const score = Math.max(0, BASE_SCORE - totalPoints)
    result.set(userId, {
      userId,
      score,
      tier: tierForScore(score),
      totalCancellations: own.length,
      violations: own.filter(c => c.severity === 'VIOLATION' || c.severity === 'SEVERE').length,
      warnings: own.filter(c => c.severity === 'WARNING' || c.severity === 'MINOR').length,
      lastCancellationAt: own[0]?.createdAt?.toISOString() ?? null,
    })
  }
  return result
}
