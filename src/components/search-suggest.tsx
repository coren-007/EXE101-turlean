'use client'

// Ô tìm kiếm kèm gợi ý autocomplete (kiểu Airbnb)
// - Gõ: gợi ý môn học + gia sư (khớp KHÔNG dấu: "hoa" → "Hóa") — debounce 250ms
// - Focus ô rỗng: "Tìm kiếm phổ biến" (môn nhiều gia sư nhất) + "Tìm kiếm gần đây" (localStorage)
// - Điều hướng bàn phím ↑↓ Enter, Esc đóng, click ngoài đóng
// - Gợi ý môn → lọc theo subject; gợi ý gia sư → mở hồ sơ luôn
import { useEffect, useRef, useState, useCallback } from 'react'
import { Search, X, Clock, TrendingUp, BookOpen, User, ArrowRight } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useApp } from '@/lib/store'

const RECENT_KEY = 'giasuconnect:recent-searches'
const MAX_RECENT = 5

export interface SuggestSubject {
  id: string; name: string; slug: string; category: string; icon: string | null; level: string | null; tutorCount: number
}
export interface SuggestTutor {
  id: string; name: string; profession: string | null; avatar: string | null
  city: string | null; district: string | null
  subjects: { name: string; slug: string }[]
  avgRating: number; reviewCount: number
}

function readRecent(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr.filter(x => typeof x === 'string').slice(0, MAX_RECENT) : []
  } catch { return [] }
}

export function pushRecentSearch(term: string) {
  if (typeof window === 'undefined' || !term.trim()) return
  try {
    const list = readRecent().filter(x => x !== term)
    list.unshift(term)
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT)))
  } catch {}
}

export function SearchSuggest({
  placeholder = 'Môn học, tên gia sư... (vd: Toán, IELTS)',
  value,
  onChange,
  onSubmit,          // Enter / nút tìm / click gợi ý "xem tất cả kết quả cho..."
  onPickSubject,     // click gợi ý môn học → lọc theo subject
  autoFocus = false,
  className = '',
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: (term: string) => void
  onPickSubject: (subject: SuggestSubject) => void
  autoFocus?: boolean
  className?: string
  placeholder?: string
}) {
  const { navigate } = useApp()
  const [open, setOpen] = useState(false)
  const [subjects, setSubjects] = useState<SuggestSubject[]>([])
  const [tutors, setTutors] = useState<SuggestTutor[]>([])
  const [popular, setPopular] = useState(false)
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1) // -1 = ô nhập; 0..n = item trong dropdown
  const [recent, setRecent] = useState<string[]>([])
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Focus ô rỗng → hiện popular + recent
  useEffect(() => {
    if (open && !value) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRecent(readRecent())
      setLoading(true)
      fetch('/api/search/suggest')
        .then(r => r.json())
        .then(d => {
          setSubjects(d.subjects || [])
          setTutors([])
          setPopular(true)
          setLoading(false)
        })
        .catch(() => setLoading(false))
    }

  }, [open, value === ''])

  // Gõ → debounce 250ms fetch gợi ý (AbortController hủy request cũ)
  useEffect(() => {
    if (!open) return
    const term = value.trim()
    const timer = setTimeout(async () => {
      abortRef.current?.abort()
      const ac = new AbortController()
      abortRef.current = ac
      setLoading(true)
      try {
        const r = await fetch(`/api/search/suggest?q=${encodeURIComponent(term)}`, { signal: ac.signal })
        const d = await r.json()
        if (ac.signal.aborted) return
        setSubjects(d.subjects || [])
        setTutors(d.tutors || [])
        setPopular(false)
        setLoading(false)
      } catch {
        if (!ac.signal.aborted) setLoading(false)
      }
    }, 250)
    return () => clearTimeout(timer)
  }, [value, open])

  // Click ngoài → đóng
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
        setActiveIndex(-1)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Danh sách phím điều hướng: môn học trước, rồi gia sư
  const keyNav = useCallback(() => [...subjects.map(s => ({ kind: 'subject' as const, s })), ...tutors.map(t => ({ kind: 'tutor' as const, t }))], [subjects, tutors])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const items = keyNav()
    if (e.key === 'Escape') {
      setOpen(false)
      setActiveIndex(-1)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActiveIndex(i => Math.min(i + 1, items.length - 1))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => Math.max(i - 1, -1))
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (activeIndex >= 0 && items[activeIndex]) {
        const item = items[activeIndex]
        if (item.kind === 'subject') onPickSubject(item.s)
        else navigate({ name: 'tutor', id: item.t.id })
        setOpen(false)
        setActiveIndex(-1)
      } else {
        onSubmit(value)
        setOpen(false)
      }
    }
  }

  const hasAny = subjects.length > 0 || tutors.length > 0 || (recent.length > 0 && !value)

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        <Input
          ref={inputRef}
          autoFocus={autoFocus}
          placeholder={placeholder}
          value={value}
          onChange={(e) => { onChange(e.target.value); setOpen(true); setActiveIndex(-1) }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          className="border-0 shadow-none focus-visible:ring-0 px-0 h-10 text-sm font-medium placeholder:font-normal"
        />
        {value && (
          <button
            onClick={() => { onChange(''); inputRef.current?.focus() }}
            aria-label="Xóa từ khóa"
            className="text-muted-foreground hover:text-foreground shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {open && hasAny && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full mt-2 z-50 bg-background border rounded-2xl shadow-e3 overflow-hidden max-h-[70vh] overflow-y-auto scroll-area"
        >
          {/* Môn học */}
          {subjects.length > 0 && (
            <div className="p-1.5">
              <p className="px-3 pt-1.5 pb-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <BookOpen className="h-3 w-3" /> {popular ? 'Tìm kiếm phổ biến' : 'Môn học'}
              </p>
              {subjects.map((s, i) => (
                <button
                  key={s.id}
                  role="option"
                  aria-selected={activeIndex === i}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-colors ${activeIndex === i ? 'bg-accent' : 'hover:bg-accent/60'}`}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => { onPickSubject(s); setOpen(false) }}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <BookOpen className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold truncate">{s.name}</span>
                    <span className="block text-xs text-muted-foreground">{s.tutorCount} gia sư đang dạy</span>
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
          )}

          {/* Gia sư */}
          {tutors.length > 0 && (
            <div className="p-1.5 border-t">
              <p className="px-3 pt-1.5 pb-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <User className="h-3 w-3" /> Gia sư
              </p>
              {tutors.map((t, i) => {
                const idx = subjects.length + i
                return (
                  <button
                    key={t.id}
                    role="option"
                    aria-selected={activeIndex === idx}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-colors ${activeIndex === idx ? 'bg-accent' : 'hover:bg-accent/60'}`}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => { navigate({ name: 'tutor', id: t.id }); setOpen(false) }}
                  >
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarImage src={t.avatar || undefined} alt={t.name} />
                      <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">{t.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold truncate">{t.name}</span>
                      <span className="block text-xs text-muted-foreground truncate">
                        {t.profession || t.subjects.map(s => s.name).join(', ')}
                      </span>
                    </span>
                    {t.reviewCount > 0 && (
                      <span className="shrink-0 text-xs font-bold">{t.avgRating}★ ({t.reviewCount})</span>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {/* Tìm kiếm gần đây (chỉ khi ô rỗng) */}
          {!value && recent.length > 0 && (
            <div className="p-1.5 border-t">
              <p className="px-3 pt-1.5 pb-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <Clock className="h-3 w-3" /> Tìm kiếm gần đây
              </p>
              {recent.map((term, i) => (
                <button
                  key={term}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-colors ${activeIndex === i ? 'bg-accent' : 'hover:bg-accent/60'}`}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => { onChange(term); onSubmit(term); setOpen(false) }}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Clock className="h-4 w-4" />
                  </span>
                  <span className="text-sm font-medium truncate">{term}</span>
                  <TrendingUp className="h-3.5 w-3.5 text-muted-foreground ml-auto shrink-0 opacity-50" />
                </button>
              ))}
            </div>
          )}

          {/* Xem tất cả kết quả */}
          {value.trim() && (
            <div className="p-1.5 border-t">
              <button
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-left hover:bg-accent/60 transition-colors"
                onClick={() => { onSubmit(value); setOpen(false) }}
              >
                <Search className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm">
                  Xem tất cả kết quả cho <span className="font-bold">“{value.trim()}”</span>
                </span>
              </button>
            </div>
          )}

          {loading && (
            <div className="px-3 py-2 text-xs text-muted-foreground border-t">Đang tìm gợi ý...</div>
          )}
        </div>
      )}
    </div>
  )
}
