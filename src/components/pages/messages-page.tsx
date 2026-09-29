'use client'

// Trang Tin nhắn — Mục đích 2: dễ dàng kết nối 2 bên gia sư ↔ phụ huynh/học sinh.
// Layout 2 cột trên desktop (danh sách + thread), dạng stacked có nút quay lại trên mobile.
// Poll nhẹ: danh sách 15s / thread 4s khi đang mở.

import { useState, useEffect, useRef, useCallback } from 'react'
import { useApp } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import {
  MessageSquare, Send, ArrowLeft, Users, ExternalLink, GraduationCap, Loader2, Bell,
} from 'lucide-react'
import { timeAgo } from '@/lib/format'
import { toast } from 'sonner'

interface ConversationItem {
  id: string
  other: {
    id: string
    name: string
    avatar?: string | null
    profession?: string | null
    role: string
  }
  lastMessage: { body: string; createdAt: string; fromMe: boolean; kind?: string } | null
  unread: number
  lastMessageAt: string
}

interface ThreadMessage {
  id: string
  body: string
  kind?: string // TEXT | SYSTEM — SYSTEM là thông báo tự động về sự kiện booking
  fromMe: boolean
  createdAt: string
  readAt?: string | null
}

export function MessagesPage({ initialConversationId }: { initialConversationId?: string }) {
  const { user, navigate } = useApp()
  const [conversations, setConversations] = useState<ConversationItem[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [activeId, setActiveId] = useState<string | undefined>(initialConversationId)
  const [thread, setThread] = useState<{ other: ConversationItem['other']; messages: ThreadMessage[] } | null>(null)
  const [loadingThread, setLoadingThread] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const loadList = useCallback(async (markSeen = false) => {
    try {
      const res = await fetch('/api/conversations')
      if (!res.ok) return
      const data = await res.json()
      setConversations(data.conversations || [])
      if (markSeen) {
        // chọn hội thoại đầu nếu chưa có và được điều hướng tới trang tin nhắn
        setActiveId(prev => prev ?? data.conversations?.[0]?.id)
      }
    } catch { /* ignore poll errors */ }
  }, [])

  const loadThread = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/conversations/${id}`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || 'Không tải được hội thoại')
        setActiveId(undefined)
        return
      }
      const data = await res.json()
      setThread({ other: data.conversation.other, messages: data.messages })
    } catch { /* ignore */ }
  }, [])

  // Load ban đầu
  useEffect(() => {
    if (!user) return
    setLoadingList(true)
    loadList(true).finally(() => setLoadingList(false))
  }, [user, loadList])

  // Mở thread theo activeId
  useEffect(() => {
    if (!user || !activeId) {
      setThread(null)
      return
    }
    setLoadingThread(true)
    loadThread(activeId).finally(() => setLoadingThread(false))
  }, [user, activeId, loadThread])

  // Poll: danh sách 15s, thread 4s
  useEffect(() => {
    if (!user) return
    const listTimer = setInterval(() => loadList(), 15_000)
    const threadTimer = setInterval(() => {
      if (activeId && document.visibilityState === 'visible') loadThread(activeId)
    }, 4_000)
    return () => {
      clearInterval(listTimer)
      clearInterval(threadTimer)
    }
  }, [user, activeId, loadList, loadThread])

  // Tự cuộn xuống tin cuối
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [thread?.messages.length, activeId])

  const sendMessage = async () => {
    const body = draft.trim()
    if (!body || !activeId || sending) return
    setSending(true)
    // optimistic UI — tin nhắn xuất hiện ngay
    const optimistic: ThreadMessage = {
      id: `tmp-${Date.now()}`,
      body,
      fromMe: true,
      createdAt: new Date().toISOString(),
    }
    setThread(prev => (prev ? { ...prev, messages: [...prev.messages, optimistic] } : prev))
    setDraft('')
    try {
      const res = await fetch(`/api/conversations/${activeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gửi tin thất bại')
      await loadThread(activeId)
      loadList()
    } catch (e: any) {
      setThread(prev =>
        prev ? { ...prev, messages: prev.messages.filter(m => m.id !== optimistic.id) } : prev,
      )
      setDraft(body)
      toast.error(e.message || 'Gửi tin thất bại')
    } finally {
      setSending(false)
    }
  }

  if (!user) {
    return (
      <div className="container mx-auto max-w-md py-16 text-center">
        <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
        <h2 className="text-2xl font-bold mb-2">Cần đăng nhập</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Đăng nhập để nhắn tin với gia sư hoặc phụ huynh/học sinh
        </p>
        <Button onClick={() => navigate({ name: 'login' })}>Đăng nhập</Button>
      </div>
    )
  }

  const isTutor = user.role === 'TUTOR'

  // ---------- Danh sách hội thoại ----------
  const ListPane = () => (
    <Card className="p-0 overflow-hidden h-full flex flex-col">
      <div className="p-4 border-b">
        <h1 className="font-bold text-lg flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" /> Tin nhắn
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {isTutor ? 'Hội thoại với phụ huynh & học sinh' : 'Hội thoại với gia sư của bạn'}
        </p>
      </div>
      <div className="flex-1 overflow-y-auto max-h-[calc(100vh-14rem)] md:max-h-[calc(100vh-16rem)]">
        {loadingList ? (
          <div className="p-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Đang tải...
          </div>
        ) : conversations.length === 0 ? (
          <div className="p-8 text-center">
            <Users className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm font-medium mb-1">Chưa có hội thoại nào</p>
            <p className="text-xs text-muted-foreground mb-4">
              {isTutor
                ? 'Khi phụ huynh/học sinh nhắn tin cho bạn, hội thoại sẽ xuất hiện ở đây'
                : 'Mở hồ sơ gia sư và bấm "Nhắn tin" để bắt đầu trò chuyện'}
            </p>
            {!isTutor && (
              <Button size="sm" onClick={() => navigate({ name: 'search' })}>
                <Users className="h-4 w-4 mr-1" /> Tìm gia sư
              </Button>
            )}
          </div>
        ) : (
          conversations.map(c => (
            <button
              key={c.id}
              onClick={() => setActiveId(c.id)}
              className={`w-full text-left p-3.5 border-b transition-colors hover:bg-accent/50 ${
                activeId === c.id ? 'bg-accent' : ''
              }`}
            >
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10 rounded-xl shrink-0">
                  <AvatarImage src={c.other.avatar || undefined} alt={c.other.name} />
                  <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                    {c.other.name.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-sm truncate ${c.unread > 0 ? 'font-bold' : 'font-medium'}`}>
                      {c.other.name}
                    </p>
                    {c.lastMessage && (
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {timeAgo(c.lastMessage.createdAt)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className="text-xs text-muted-foreground truncate">
                      {c.lastMessage ? (
                        c.lastMessage.kind === 'SYSTEM' ? (
                          <span className="inline-flex items-center gap-1">
                            <Bell className="h-3 w-3 text-primary shrink-0" />
                            <span className="truncate">{c.lastMessage.body.split('\n')[0]}</span>
                          </span>
                        ) : (
                          `${c.lastMessage.fromMe ? 'Bạn: ' : ''}${c.lastMessage.body}`
                        )
                      ) : (
                        'Bắt đầu hội thoại'
                      )}
                    </p>
                    {c.unread > 0 && (
                      <Badge className="bg-primary text-primary-foreground border-0 shrink-0 h-5 min-w-5 px-1.5 text-[10px] flex items-center justify-center">
                        {c.unread > 9 ? '9+' : c.unread}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </Card>
  )

  // ---------- Thread hội thoại ----------
  const ThreadPane = () => {
    if (!activeId || !thread) {
      return (
        <Card className="p-0 h-full hidden md:flex flex-col items-center justify-center text-center">
          <MessageSquare className="h-12 w-12 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">Chọn một hội thoại để bắt đầu</p>
        </Card>
      )
    }
    const other = thread.other
    return (
      <Card className="p-0 overflow-hidden h-full flex flex-col">
        {/* Header */}
        <div className="p-3.5 border-b flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden h-8 w-8 shrink-0"
            onClick={() => setActiveId(undefined)}
            aria-label="Quay lại danh sách"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Avatar className="h-9 w-9 rounded-xl shrink-0">
            <AvatarImage src={other.avatar || undefined} alt={other.name} />
            <AvatarFallback className="bg-primary/10 text-primary font-semibold">
              {other.name.charAt(0)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{other.name}</p>
            <p className="text-[11px] text-muted-foreground truncate">
              {other.role === 'TUTOR'
                ? other.profession || 'Gia sư'
                : 'Phụ huynh/Học sinh'}
            </p>
          </div>
          {other.role === 'TUTOR' && (
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => navigate({ name: 'tutor', id: other.id })}
            >
              <ExternalLink className="h-3.5 w-3.5 mr-1" /> Xem hồ sơ
            </Button>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 min-h-[300px] max-h-[calc(100vh-22rem)] md:max-h-[calc(100vh-24rem)]">
          {loadingThread && thread.messages.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Đang tải...
            </div>
          ) : thread.messages.length === 0 ? (
            <div className="p-8 text-center">
              <GraduationCap className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">
                Chưa có tin nhắn. Hãy gửi lời chào đầu tiên!
              </p>
            </div>
          ) : (
            thread.messages.map(m =>
              m.kind === 'SYSTEM' ? (
                // Thông báo hệ thống về sự kiện booking — thẻ giữa luồng chat,
                // không phải bong bóng tin nhắn (mẫu Airbnb-style booking card)
                <div key={m.id} className="flex justify-center">
                  <div className="max-w-[85%] md:max-w-[75%] rounded-xl border border-dashed bg-muted/40 px-3.5 py-2.5 text-center">
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <Bell className="h-3.5 w-3.5 text-primary" />
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">
                        Thông báo lớp học
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words leading-relaxed text-left">
                      {m.body}
                    </p>
                    <p className="text-[10px] text-muted-foreground/70 mt-1 text-center">
                      {timeAgo(m.createdAt)}
                    </p>
                  </div>
                </div>
              ) : (
                <div key={m.id} className={`flex ${m.fromMe ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[80%] md:max-w-[70%] rounded-2xl px-3.5 py-2 ${
                      m.fromMe
                        ? 'bg-primary text-primary-foreground rounded-br-md'
                        : 'bg-muted rounded-bl-md'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{m.body}</p>
                    <p className={`text-[10px] mt-1 ${m.fromMe ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                      {timeAgo(m.createdAt)}
                      {m.fromMe && m.readAt ? ' · Đã xem' : ''}
                    </p>
                  </div>
                </div>
              ),
            )
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="p-3 border-t flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, 1000))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                sendMessage()
              }
            }}
            placeholder="Nhập tin nhắn... (Enter để gửi)"
            rows={1}
            className="flex-1 resize-none border rounded-xl px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 min-h-[40px] max-h-28"
          />
          <Button
            size="icon"
            className="h-10 w-10 shrink-0"
            onClick={sendMessage}
            disabled={!draft.trim() || sending}
            aria-label="Gửi tin nhắn"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </Card>
    )
  }

  // Mobile: hiện 1 pane (thread nếu đang mở, ngược lại là danh sách)
  return (
    <div className="container mx-auto max-w-6xl px-4 py-6">
      <div className="grid md:grid-cols-[340px_1fr] gap-4 h-[calc(100vh-8rem)] md:h-[calc(100vh-9rem)]">
        <div className={`${activeId ? 'hidden md:block' : 'block'} min-h-0`}>
          <ListPane />
        </div>
        <div className={`${activeId ? 'block' : 'hidden md:block'} min-h-0`}>
          <ThreadPane />
        </div>
      </div>
      <Separator className="md:hidden my-6" />
    </div>
  )
}
