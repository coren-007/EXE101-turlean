'use client'

import { GraduationCap, Heart, Mail, Phone } from 'lucide-react'

export function Footer() {
  return (
    <footer className="mt-auto border-t bg-muted/30">
      <div className="container mx-auto max-w-7xl px-4 py-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div className="col-span-2">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <GraduationCap className="h-4 w-4" />
              </div>
              <span className="text-base font-bold">GiaSu<span className="text-primary">Connect</span></span>
            </div>
            <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
              Nền tảng kết nối gia sư với phụ huynh và học sinh tại Việt Nam. Điểm khác biệt: linh hoạt 2 chiều — gia sư đến nhà hoặc học sinh đến nơi dạy.
            </p>
          </div>

          <div>
            <h4 className="text-sm font-semibold mb-3">Khám phá</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="hover:text-foreground cursor-pointer">Tìm gia sư</li>
              <li className="hover:text-foreground cursor-pointer">Trở thành gia sư</li>
              <li className="hover:text-foreground cursor-pointer">Môn học phổ biến</li>
              <li className="hover:text-foreground cursor-pointer">Câu chuyện thành công</li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold mb-3">Hỗ trợ</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2"><Phone className="h-3.5 w-3.5" /> 1900 1234</li>
              <li className="flex items-center gap-2"><Mail className="h-3.5 w-3.5" /> hotro@giasu.vn</li>
              <li className="hover:text-foreground cursor-pointer">Câu hỏi thường gặp</li>
              <li className="hover:text-foreground cursor-pointer">Điều khoản sử dụng</li>
            </ul>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t flex flex-col sm:flex-row justify-between items-center gap-3">
          <p className="text-xs text-muted-foreground">© 2026 GiaSuConnect. Bản quyền thuộc về chúng tôi.</p>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            Made with <Heart className="h-3 w-3 fill-primary text-primary" /> tại Hà Nội
          </p>
        </div>
      </div>
    </footer>
  )
}
