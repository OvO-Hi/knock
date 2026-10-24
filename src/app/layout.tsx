import type { Metadata, Viewport } from "next";
import Toaster from "@/components/Toaster";
import "./globals.css";

const DESCRIPTION = "강남구·춘천시 47개 행정동의 중장년(50~60대) 사회적 고립 위험을 지도로 보고, 근거와 대응을 묻는 AI 에이전트";

export const metadata: Metadata = {
  title: "노크 — 중장년 고립 위험 지도",
  description: DESCRIPTION,
  openGraph: {
    title: "노크 — 중장년 고립 위험 지도",
    description: DESCRIPTION,
    locale: "ko_KR",
    type: "website",
    siteName: "노크 KNOCK",
  },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f6f6f3" };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
