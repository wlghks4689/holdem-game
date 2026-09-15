import type { Metadata } from "next";
import { FxLabClient } from "./FxLabClient";

export const metadata: Metadata = {
  title: "메이드 연출 테스트 | MysteryHoldem",
  description: "MysteryHoldem의 메이드 연출을 족보·스트리트별로 확인하는 개발용 화면.",
  // 개발용 화면이라 검색 노출은 막는다.
  robots: { index: false, follow: false },
};

export default function MysteryHoldemFxLabPage() {
  return <FxLabClient />;
}
