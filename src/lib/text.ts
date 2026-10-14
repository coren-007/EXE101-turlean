// Tiện ích xử lý văn bản tiếng Việt cho tìm kiếm
// normalizeVi: chuẩn hóa về dạng thường + không dấu ("Hóa" → "hoa", "đ" → "d")
// dùng cho matching không phân biệt dấu — người dùng hay gõ không dấu trên mobile.
export function normalizeVi(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // bỏ combining marks (dấu tiếng Việt)
    .replace(/đ/g, 'd')
    .trim()
}

// Ghép haystack chuẩn hóa từ các trường có thể tìm kiếm của tutor
export function normalizeTutorHaystack(t: {
  name?: string | null
  profession?: string | null
  bio?: string | null
  tutorSubjects?: { subject: { name: string } }[]
}): string {
  const parts: (string | null | undefined)[] = [t.name, t.profession, t.bio]
  if (t.tutorSubjects) parts.push(...t.tutorSubjects.map(ts => ts.subject.name))
  return parts.filter((p): p is string => Boolean(p)).map(p => normalizeVi(p)).join(' | ')
}
