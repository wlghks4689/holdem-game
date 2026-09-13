import type { Metadata } from "next";
import { MysteryHoldemClient } from "./MysteryHoldemClient";

export const metadata: Metadata = {
  title: "MysteryHoldem | 비공개 Mission을 노리는 신규 홀덤",
  description:
    "3장 중 2장을 골라 시작하고 비공개 Mystery Mission으로 점수를 쌓는 최대 10인용 Pot-Limit 홀덤 변형 게임.",
  alternates: { canonical: "/mystery-holdem" },
};

export default function MysteryHoldemPage() {
  return <MysteryHoldemClient />;
}
