import type { Metadata } from "next";
import { HoldemHomeOrLegacy } from "./holdem/components/HoldemHomeOrLegacy";

export const metadata: Metadata = {
  title: "핸드 셀렉 홀덤 | 원하는 패를 선택하는 전략 텍사스 홀덤",
  description: "정해진 핸드 풀에서 원하는 카드 조합을 선택해 플레이하는 전략형 텍사스 홀덤 게임입니다.",
  alternates: { canonical: "/holdem" },
};

export default function Home() {
  return <HoldemHomeOrLegacy />;
}
