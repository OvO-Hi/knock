import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "노크 KNOCK",
  description: "중장년 사회적 고립 위험 탐지·대응 AI 에이전트",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
