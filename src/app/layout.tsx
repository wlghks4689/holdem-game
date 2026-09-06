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
  title: "핸드 셀렉 홀덤 | 원하는 패를 선택하는 전략 텍사스 홀덤",
  description: "정해진 핸드 풀에서 원하는 카드 조합을 선택해 플레이하는 전략형 텍사스 홀덤 게임입니다.",
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
