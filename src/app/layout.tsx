import type { Metadata } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";

const vietnam = Be_Vietnam_Pro({
  variable: "--font-vietnam",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "GiaSuConnect - Nền tảng kết nối gia sư với phụ huynh & học sinh",
  description: "Tìm gia sư uy tín theo vị trí: gia sư đến nhà hoặc học sinh đến nơi dạy. Hồ sơ minh bạch, đánh giá thực tế, đặt lịch dễ dàng.",
  keywords: ["gia sư", "tutor", "dạy kèm", "toán", "tiếng anh", "piano", "vẽ", "Hà Nội"],
  authors: [{ name: "GiaSuConnect" }],
  openGraph: {
    title: "GiaSuConnect",
    description: "Tìm gia sư uy tín theo vị trí gần bạn",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body
        className={`${vietnam.variable} font-sans antialiased bg-background text-foreground`}
        style={{ fontFamily: 'var(--font-vietnam), system-ui, sans-serif' }}
      >
        {children}
        <Toaster />
        <SonnerToaster position="top-center" richColors />
      </body>
    </html>
  );
}
