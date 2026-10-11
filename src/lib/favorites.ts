'use client'

// Wishlist store — gia sư yêu thích
// * Đã đăng nhập: nguồn sự thật là DB (Favorite) → load/toggle qua API
// * Guest: fallback localStorage (key cũ 'favorite_tutors' — tương thích ngược)
// * Khi login: tự merge localStorage lên DB rồi dọn local
import { create } from 'zustand'
import { toast } from 'sonner'

const LOCAL_KEY = 'favorite_tutors'

function readLocal(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.filter(x => typeof x === 'string') : []
  } catch {
    return []
  }
}

function writeLocal(ids: string[]) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(ids))
  } catch {}
}

interface FavoritesState {
  ids: string[]          // danh sách tutorId đã lưu (theo role hiện tại)
  loaded: boolean        // đã load cho phiên hiện tại (theo user id)
  loadedFor: string | null
  isFavorite: (tutorId: string) => boolean
  load: (user: { id: string } | null) => Promise<void>
  toggle: (tutorId: string, tutorName?: string) => Promise<void>
}

export const useFavorites = create<FavoritesState>((set, get) => ({
  ids: [],
  loaded: false,
  loadedFor: null,

  isFavorite: (tutorId) => get().ids.includes(tutorId),

  load: async (user) => {
    if (!user) {
      // Guest → đọc localStorage
      set({ ids: readLocal(), loaded: true, loadedFor: null })
      return
    }
    if (get().loadedFor === user.id && get().loaded) return
    try {
      const r = await fetch('/api/favorites')
      if (r.status === 401) {
        set({ ids: readLocal(), loaded: true, loadedFor: null })
        return
      }
      const data = await r.json()
      const dbIds: string[] = data.ids || []

      // Merge localStorage của guest lên DB (một lần) rồi dọn
      const localIds = readLocal()
      const toMerge = localIds.filter(id => !dbIds.includes(id))
      if (toMerge.length > 0) {
        const mr = await fetch('/api/favorites?action=merge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tutorIds: [...toMerge] }),
        })
        if (mr.ok) {
          writeLocal([])
          dbIds.push(...toMerge)
        }
      }
      set({ ids: dbIds, loaded: true, loadedFor: user.id })
    } catch {
      set({ ids: readLocal(), loaded: true, loadedFor: null })
    }
  },

  toggle: async (tutorId, tutorName) => {
    const { ids, loadedFor } = get()
    const wasFav = ids.includes(tutorId)
    // Optimistic UI — cập nhật ngay, rollback nếu lỗi
    set({ ids: wasFav ? ids.filter(i => i !== tutorId) : [...ids, tutorId] })

    if (!loadedFor) {
      // Guest → localStorage
      writeLocal(get().ids)
      toast.success(wasFav
        ? `Đã bỏ lưu ${tutorName || 'gia sư'}`
        : `Đã lưu ${tutorName || 'gia sư'} vào danh sách yêu thích`)
      return
    }

    try {
      const r = await fetch('/api/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tutorId }),
      })
      if (!r.ok) throw new Error()
      const data = await r.json()
      // Optimistic state đã đúng (thêm/bỏ ở trên) — KHÔNG set lại kẻo append trùng ID.
      // Server lỗi thì catch bên dưới rollback.
      toast.success(data.favorited
        ? `Đã lưu ${tutorName || 'gia sư'} vào danh sách yêu thích`
        : `Đã bỏ lưu ${tutorName || 'gia sư'}`)
    } catch {
      // Rollback
      set({ ids })
      toast.error('Không lưu được — thử lại sau')
    }
  },
}))
