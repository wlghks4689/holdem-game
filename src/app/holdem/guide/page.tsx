import Link from "next/link";
import { TOTAL_ROUNDS, STARTING_CHIPS, IA_COST_MIN_BB } from "@/holdem/constants";

/* ──────────────────────────────────────────────
   재사용 컴포넌트
────────────────────────────────────────────── */
function Section({
  title,
  emoji,
  children,
}: {
  title: string;
  emoji: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8 rounded-xl border border-zinc-700/60 bg-zinc-800/40 px-5 py-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-zinc-100">
        <span aria-hidden>{emoji}</span>
        {title}
      </h2>
      <div className="space-y-2 text-sm leading-relaxed text-zinc-300">
        {children}
      </div>
    </section>
  );
}

function Step({
  num,
  label,
  desc,
}: {
  num: number;
  label: string;
  desc: string;
}) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-[11px] font-bold text-amber-300 ring-1 ring-amber-500/35">
        {num}
      </span>
      <span>
        <span className="font-semibold text-zinc-100">{label}</span>
        <span className="ml-1 text-zinc-400">{desc}</span>
      </span>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block rounded bg-zinc-700/70 px-1.5 py-0.5 font-mono text-[11px] text-zinc-300">
      {children}
    </span>
  );
}

/* ──────────────────────────────────────────────
   페이지
────────────────────────────────────────────── */
export default function HoldemGuidePage() {
  return (
    <div className="min-h-dvh bg-gradient-to-b from-zinc-900 to-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-xl px-4 py-10 pb-20 lg:max-w-2xl lg:py-14">
        {/* 뒤로가기 */}
        <Link
          href="/holdem"
          className="text-sm font-medium text-sky-400 hover:text-sky-300 hover:underline"
        >
          ← 홈으로
        </Link>

        {/* 타이틀 */}
        <div className="mt-6">
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
            게임 설명
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            두 장의 카드를 직접 고르고, 공용 카드와 합쳐{" "}
            <strong className="text-zinc-200">더 강한 패를 만드는 사람</strong>이
            이기는 1:1 포커 게임입니다.
          </p>
        </div>

        {/* 1. 플레이 흐름 */}
        <Section title="플레이 흐름" emoji="🎯">
          <Step
            num={1}
            label="카드 2장을 선택합니다"
            desc="매 라운드 시작 시, 자신의 핸드 풀에서 원하는 2장짜리 세트를 고릅니다. 상대방은 내가 무엇을 골랐는지 모릅니다."
          />
          <Step
            num={2}
            label="프리플랍 베팅을 합니다"
            desc="카드를 고른 뒤 공용 카드가 공개되기 전, 한 번의 베팅 기회가 있습니다."
          />
          <Step
            num={3}
            label="공용 카드(플랍·턴·리버)가 한 장씩 공개됩니다"
            desc="총 5장이 순서대로 테이블에 깔립니다. 각 단계마다 베팅을 합니다."
          />
          <Step
            num={4}
            label="최강 5장 패를 만든 사람이 이깁니다"
            desc="내 2장 + 공용 카드 5장 중 가장 좋은 5장 조합으로 비교합니다."
          />
        </Section>

        {/* 2. 승리 조건 */}
        <Section title="승리 조건" emoji="🏆">
          <p>
            상대방의 칩을 모두 가져오면 승리합니다.
            시작 스택은 <Tag>{STARTING_CHIPS}칩</Tag>이며, 총{" "}
            <Tag>{TOTAL_ROUNDS}라운드</Tag> 동안 진행됩니다.
          </p>
          <p className="text-zinc-400">
            라운드가 진행될수록 블라인드(강제 베팅 금액)가 점점 올라가므로, 후반으로 갈수록 한 판의 비중이 커집니다.
          </p>
        </Section>

        {/* 3. 이 게임만의 특징 */}
        <Section title="이 게임만의 특징" emoji="✨">
          <p>
            일반 포커와 달리{" "}
            <strong className="text-zinc-100">
              카드가 무작위로 배분되지 않습니다.
            </strong>
          </p>
          <p>
            각 플레이어는 미리 정해진{" "}
            <strong className="text-zinc-100">핸드 풀(카드 세트 모음)</strong>을
            가지고 있고, 그 중 원하는 2장 세트를 직접 선택합니다.
          </p>
          <p className="text-zinc-400">
            상대가 어떤 카드를 선택했는지 알 수 없기 때문에,{" "}
            <em>심리전과 패 읽기</em>가 중요한 요소가 됩니다.
          </p>
        </Section>

        {/* 4. IA(정보 구매) */}
        <Section
          title="IA (Information Acquisition) — 정보 구매 · 리버 한정"
          emoji="🔍"
        >
          <p>
            <strong className="text-zinc-100">IA</strong>는{" "}
            <em>Information Acquisition(정보 구매)</em>의 줄임말입니다.
            리버(마지막 공용 카드 공개 후) 베팅 차례에서만 사용할 수 있습니다.
          </p>
          <p>
            IA를 사용하면 칩{" "}
            <Tag>팟의 30% (최소 {IA_COST_MIN_BB}bb)</Tag>를 지불하고,{" "}
            <strong className="text-zinc-100">
              상대방이 가질 수 있는 패의 종류(카테고리)
            </strong>
            를 확인합니다.
          </p>
          <p className="text-zinc-400">
            정확한 패가 아닌 대략적인 카테고리(예: 하이파켓, 미들파켓,
            브로드웨이 수딧 등)만 공개됩니다. 사용 후 해당 베팅 타이머가 10초
            추가됩니다.
          </p>
        </Section>

        {/* 5. 온라인 멀티플레이 */}
        <Section title="온라인 대전" emoji="🌐">
          <p>
            홈 화면에서{" "}
            <strong className="text-zinc-100">방 만들기</strong>를 누르면 초대
            링크가 생성됩니다.
          </p>
          <p>
            링크를 상대에게 보내면 바로 입장할 수 있습니다.
            방 코드는 따로 필요 없습니다.
          </p>
          <p className="text-zinc-400">
            상대방의 카드는 최종 쇼다운(패 비교) 전까지 절대 이 기기로 전달되지
            않아, 정보 유출 없이 공정하게 진행됩니다.
          </p>
        </Section>

        {/* 6. 베팅 구조 */}
        <Section title="베팅 구조" emoji="💰">
          <p>
            각 라운드에서 한 명은{" "}
            <Tag>딜러(SB)</Tag>, 상대는{" "}
            <Tag>BB</Tag> 역할을 맡습니다.
          </p>
          <ul className="space-y-1.5 pl-1 text-zinc-400">
            <li>
              <span className="font-medium text-zinc-200">
                프리플랍(공용 카드 공개 전)
              </span>{" "}
              — <span className="text-zinc-300">딜러(SB)</span>가 먼저
              베팅합니다. 콜·레이즈·폴드 중 선택.
            </li>
            <li>
              <span className="font-medium text-zinc-200">
                플랍·턴·리버(공용 카드 공개 후)
              </span>{" "}
              — <span className="text-zinc-300">BB(상대방)</span>가 먼저
              액션합니다. 체크·베팅·폴드 중 선택.
            </li>
            <li>매 라운드가 끝날 때마다 딜러 역할이 바뀝니다.</li>
          </ul>
          <p className="text-zinc-400">
            스택이 {STARTING_CHIPS > 0 ? `남은 칩의` : ``}{" "}
            <strong className="text-zinc-200">15bb 이하</strong>로 줄어들면 프리플랍에서 바로 전액 올인을 선택할 수도 있습니다.
          </p>
        </Section>

        {/* 7. 패의 등급 */}
        <Section title="패의 등급 (강한 순)" emoji="🃏">
          <ol className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-zinc-400 sm:grid-cols-3">
            {[
              "로얄 플러시",
              "스트레이트 플러시",
              "포카드",
              "풀하우스",
              "플러시",
              "스트레이트",
              "트리플",
              "투페어",
              "원페어",
              "하이카드",
            ].map((rank, i) => (
              <li key={rank} className="flex items-center gap-1.5">
                <span className="w-4 text-right font-mono text-[10px] text-zinc-600">
                  {i + 1}.
                </span>
                <span className={i < 3 ? "text-amber-300" : ""}>{rank}</span>
              </li>
            ))}
          </ol>
        </Section>

        {/* 하단 CTA */}
        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href="/holdem/practice"
            className="rounded-xl border border-emerald-600/60 bg-emerald-900/30 px-4 py-3 text-sm font-semibold text-emerald-100 hover:bg-emerald-900/55 active:scale-[0.98]"
          >
            연습 게임 시작하기 →
          </Link>
          <Link
            href="/holdem"
            className="rounded-xl border border-zinc-600/60 bg-zinc-800/40 px-4 py-3 text-sm font-semibold text-zinc-200 hover:bg-zinc-800/70 active:scale-[0.98]"
          >
            홈으로
          </Link>
        </div>
      </div>
    </div>
  );
}
