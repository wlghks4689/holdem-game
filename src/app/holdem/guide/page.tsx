import Link from "next/link";
import { HEADS_UP_RULES_BLURB } from "@/holdem/headsUpLabels";
import { TOTAL_ROUNDS } from "@/holdem/constants";

export default function HoldemGuidePage() {
  return (
    <div className="min-h-dvh bg-gradient-to-b from-zinc-900 to-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-xl px-4 py-10 pb-16 lg:max-w-2xl lg:py-14">
        <Link
          href="/holdem"
          className="text-sm font-medium text-sky-400 hover:text-sky-300 hover:underline"
        >
          ← 홈으로
        </Link>
        <h1 className="mt-6 text-2xl font-bold">게임 설명</h1>
        <p className="mt-2 text-sm text-zinc-400">
          핸드 풀 홀덤은 정해진 &apos;핸드 풀&apos;에서 hole 두 장을 고르고, 보드와
          맞춰 최선의 5장을 만듭니다.
        </p>

        <section className="mt-8 space-y-3 text-sm leading-relaxed text-zinc-300">
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
            헤즈업 규칙
          </h2>
          <p>{HEADS_UP_RULES_BLURB}</p>
        </section>

        <section className="mt-8 space-y-3 text-sm leading-relaxed text-zinc-300">
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
            라운드
          </h2>
          <p>
            스택이 바닥날 때까지 여러 핸드를 진행하며, 기본 구성은 총 {TOTAL_ROUNDS}
            라운드 분량입니다(표시는 게임 상태를 따릅니다).
          </p>
        </section>

        <section className="mt-8 space-y-3 text-sm leading-relaxed text-zinc-300">
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
            온라인 멀티플레이
          </h2>
          <p>
            홈에서 &quot;방 만들기&quot;를 누르면 초대 링크가 만들어집니다. 링크를
            상대에게 보내면 같은 방에 바로 입장할 수 있습니다. 상대의 홀 카드는
            쇼다운 전까지 이 기기에 전달되지 않습니다.
          </p>
        </section>

        <section className="mt-8 space-y-3 text-sm leading-relaxed text-zinc-300">
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
            IA (가능한 최선의 패)
          </h2>
          <p>
            선택한 hole에 대해 가능한 보드 조합 중 최고 족보를 기준으로 IA가
            표시됩니다. 자신의 턴에 의사 결정을 돕는 용도입니다.
          </p>
        </section>
      </div>
    </div>
  );
}
