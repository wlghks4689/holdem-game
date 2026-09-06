import type { Metadata } from "next";
import { GuideClient } from "./GuideClient";

export const metadata: Metadata = {
  title: "게임 방법과 규칙 | 핸드 셀렉 홀덤",
  description: "핸드 셀렉 홀덤의 핸드 선택, 베팅, 승리 조건과 Classic·Cost 모드의 게임 방법을 알아보세요.",
  alternates: { canonical: "/holdem/guide" },
};

export default function HoldemGuidePage() {
  return <GuideClient />;
}
