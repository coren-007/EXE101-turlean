'use client'

import { useEffect, useState } from 'react'
import { MessageSquareHeart, ExternalLink } from 'lucide-react'

/** Link Google Form đánh giá sản phẩm (dùng chung cho nút nổi + footer) */
export const FEEDBACK_FORM_URL = 'https://forms.gle/JcMrWenHp6exnzVH7'

/**
 * Nút góp ý nổi (góc dưới phải) — mở Google Form đánh giá sản phẩm ở tab mới.
 * Được gắn ở root layout nên hiện trên mọi trang, kể cả đăng nhập/onboarding,
 * giúp người dùng gửi phản hồi bất cứ lúc nào trong quá trình trải nghiệm.
 */
export function FeedbackWidget() {
  const [ready, setReady] = useState(false)
  const [expanded, setExpanded] = useState(false)

  // Trượt lên sau ~1s khi vào trang — giữ ấn tượng đầu tiên sạch sẽ
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 1000)
    return () => clearTimeout(t)
  }, [])

  return (
    <a
      href={FEEDBACK_FORM_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Góp ý về sản phẩm GiaSuConnect — mở biểu mẫu ở tab mới"
      title="Góp ý về sản phẩm"
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      onFocus={() => setExpanded(true)}
      onBlur={() => setExpanded(false)}
      className={[
        'fixed bottom-4 right-4 md:bottom-6 md:right-6 z-40 isolate',
        'flex items-center gap-2 h-12 rounded-full',
        'bg-primary text-primary-foreground pl-3.5 pr-4',
        'shadow-e1 hover:shadow-lg hover:bg-primary/90 hover:-translate-y-0.5',
        'transition-all duration-300 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        ready ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none',
      ].join(' ')}
    >
      {/* Vòng pulse thu hút sự chú ý (thuần trang trí, tôn trọng prefers-reduced-motion) */}
      <span className="feedback-pulse z-0" aria-hidden="true" />
      <MessageSquareHeart className="relative z-10 h-5 w-5 shrink-0" />
      {/* Mobile: luôn hiện nhãn ngắn (không có hover) */}
      <span className="relative z-10 flex items-center font-semibold text-sm md:hidden">Góp ý</span>
      {/* Desktop: mở rộng nhãn đầy đủ khi hover/focus */}
      <span
        className={`relative z-10 hidden md:flex items-center gap-1.5 overflow-hidden whitespace-nowrap font-semibold text-sm transition-all duration-300 ${
          expanded ? 'max-w-[190px] opacity-100' : 'max-w-0 opacity-0'
        }`}
      >
        Góp ý về sản phẩm
        <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-70" />
      </span>
    </a>
  )
}
