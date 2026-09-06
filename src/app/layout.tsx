import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://holdem-game.vercel.app"),
  title: "핸드 셀렉 홀덤",
  description: "핸드를 직접 선택하는 캐주얼 텍사스 홀덤 게임. 친구와 온라인 멀티플레이를 즐기거나 AI 싱글플레이와 Classic·Cost 연습 모드에 도전하세요.",
  verification: {
    google: "7tro-Lz0PV4TGpW23xvxF7vdVNyVCOaf1gBvSV_758E",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
