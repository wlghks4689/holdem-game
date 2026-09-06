import type { Metadata } from "next";
import { GuideClient } from "./GuideClient";

export const metadata: Metadata = {
  title: "핸드 셀렉 홀덤 게임 방법 | 규칙과 플레이 가이드",
  description: "핸드 셀렉 홀덤의 기본 규칙과 플레이 방법을 소개합니다. 핸드 풀에서 카드를 선택하는 방법부터 베팅, 승리 조건까지 확인할 수 있습니다.",
  alternates: { canonical: "/holdem/guide" },
};

export default function HoldemGuidePage() {
  return <GuideClient />;
}
