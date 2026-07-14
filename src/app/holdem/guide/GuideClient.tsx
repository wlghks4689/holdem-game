"use client";

import Link from "next/link";
import {
  TOTAL_ROUNDS,
  STARTING_CHIPS,
  IA_COST_MIN_BB,
  PREFLOP_MAX_POT_BB,
  MAX_RAISES_PER_STREET,
  PREFLOP_SHORT_STACK_ALL_IN_MAX_BB,
} from "@/holdem/constants";
import { useHoldemI18n } from "@/holdem/i18n/HoldemLocaleProvider";

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
  note,
}: {
  num: number;
  label: string;
  desc: string;
  note?: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-[11px] font-bold text-amber-300 ring-1 ring-amber-500/35">
        {num}
      </span>
      <span className="flex flex-col gap-1">
        <span>
          <span className="font-semibold text-zinc-100">{label}</span>
          <span className="ml-1 text-zinc-400">{desc}</span>
        </span>
        {note ? (
          <span className="rounded-lg border border-amber-600/30 bg-amber-950/25 px-2.5 py-1.5 text-[12px] leading-relaxed text-zinc-400">
            {note}
          </span>
        ) : null}
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
export function GuideClient() {
  const { locale } = useHoldemI18n();
  const isEn = locale === "en";

  const handRanksKo = [
    "로얄 플러시", "스트레이트 플러시", "포카드", "풀하우스", "플러시",
    "스트레이트", "트리플", "투페어", "원페어", "하이카드",
  ];
  const handRanksEn = [
    "Royal Flush", "Straight Flush", "Four of a Kind", "Full House", "Flush",
    "Straight", "Three of a Kind", "Two Pair", "One Pair", "High Card",
  ];
  const handRanks = isEn ? handRanksEn : handRanksKo;

  return (
    <div className="min-h-dvh bg-gradient-to-b from-zinc-900 to-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-xl px-4 py-10 pb-20 lg:max-w-2xl lg:py-14">
        {/* 뒤로가기 */}
        <Link
          href="/holdem"
          className="text-sm font-medium text-sky-400 hover:text-sky-300 hover:underline"
        >
          {isEn ? "← Home" : "← 홈으로"}
        </Link>

        {/* 타이틀 */}
        <div className="mt-6">
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
            {isEn ? "How to Play" : "게임 설명"}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            {isEn ? (
              <>
                Pick two cards yourself and combine them with the community cards —
                the player who makes the{" "}
                <strong className="text-zinc-200">stronger 5-card hand</strong> wins.
              </>
            ) : (
              <>
                두 장의 카드를 직접 고르고, 공용 카드와 합쳐{" "}
                <strong className="text-zinc-200">더 강한 패를 만드는 사람</strong>이
                이기는 1:1 포커 게임입니다.
              </>
            )}
          </p>
        </div>

        {/* 1. 플레이 흐름 */}
        <Section title={isEn ? "How a Hand Plays Out" : "플레이 흐름"} emoji="🎯">
          <Step
            num={1}
            label={isEn ? "Choose 2 cards" : "카드 2장을 선택합니다"}
            desc={
              isEn
                ? "At the start of each round, pick a 2-card set from your hand pool. Your opponent cannot see your selection."
                : "매 라운드 시작 시, 자신의 핸드 풀에서 원하는 2장짜리 세트를 고릅니다. 상대방은 내가 무엇을 골랐는지 모릅니다."
            }
          />
          <Step
            num={2}
            label={isEn ? "Preflop betting" : "프리플랍 베팅을 합니다"}
            desc={
              isEn
                ? "After selecting your cards, one round of betting takes place before any community cards are revealed."
                : "카드를 고른 뒤 공용 카드가 공개되기 전, 한 번의 베팅 기회가 있습니다."
            }
            note={
              isEn ? (
                <>
                  <span className="font-semibold text-amber-300/90">No pot cap (no-limit)</span>
                  — Your bets/raises are limited only by your stack. You can go all-in
                  at any time (including preflop).
                </>
              ) : (
                <>
                  <span className="font-semibold text-amber-300/90">팟 상한 없음 (노리밋)</span>
                  — 베팅/레이즈는 오직 내 스택만큼만 가능하며, 프리플랍에서도 언제든 전액
                  올인을 할 수 있습니다.
                </>
              )
            }
          />
          <Step
            num={3}
            label={isEn ? "Community cards are revealed in stages" : "공용 카드가 단계별로 공개됩니다"}
            desc={
              isEn
                ? "Flop (3 cards at once) → Turn (1 card) → River (1 card). A betting round follows each stage."
                : "플랍 3장이 한꺼번에 공개된 뒤, 턴 1장·리버 1장 순서로 공개됩니다. 각 단계마다 베팅을 합니다."
            }
          />
          <Step
            num={4}
            label={isEn ? "Best 5-card hand wins" : "최강 5장 패를 만든 사람이 이깁니다"}
            desc={
              isEn
                ? "Your 2 hole cards + any 5 community cards — best possible 5-card combination wins."
                : "내 2장 + 공용 카드 5장 중 가장 좋은 5장 조합으로 비교합니다."
            }
          />
        </Section>

        {/* 2. 승리 조건 */}
        <Section title={isEn ? "Victory Condition" : "승리 조건"} emoji="🏆">
          <p>
            {isEn ? (
              <>
                Take all of your opponent&apos;s chips to win.
                Starting stack is <Tag>{STARTING_CHIPS} chips</Tag>, played over{" "}
                <Tag>{TOTAL_ROUNDS} rounds</Tag>.
              </>
            ) : (
              <>
                상대방의 칩을 모두 가져오면 승리합니다.
                시작 스택은 <Tag>{STARTING_CHIPS}칩</Tag>이며, 총{" "}
                <Tag>{TOTAL_ROUNDS}라운드</Tag> 동안 진행됩니다.
              </>
            )}
          </p>
          <p className="text-zinc-400">
            {isEn
              ? "Blinds increase as the rounds progress, making each hand more decisive in the later stages."
              : "라운드가 진행될수록 블라인드(강제 베팅 금액)가 점점 올라가므로, 후반으로 갈수록 한 판의 비중이 커집니다."}
          </p>
        </Section>

        {/* 3. 이 게임만의 특징 */}
        <Section title={isEn ? "What Makes This Game Unique" : "이 게임만의 특징"} emoji="✨">
          <p>
            {isEn ? (
              <>
                Unlike standard poker,{" "}
                <strong className="text-zinc-100">cards are not randomly dealt.</strong>
              </>
            ) : (
              <>
                일반 포커와 달리{" "}
                <strong className="text-zinc-100">카드가 무작위로 배분되지 않습니다.</strong>
              </>
            )}
          </p>
          <p>
            {isEn ? (
              <>
                Each player has a pre-defined{" "}
                <strong className="text-zinc-100">hand pool (a collection of 2-card sets)</strong>{" "}
                and picks their preferred set each round.
              </>
            ) : (
              <>
                각 플레이어는 미리 정해진{" "}
                <strong className="text-zinc-100">핸드 풀(카드 세트 모음)</strong>을
                가지고 있고, 그 중 원하는 2장 세트를 직접 선택합니다.
              </>
            )}
          </p>
          <p className="text-zinc-400">
            {isEn
              ? "Since neither player knows what the other chose, mind games and hand reading become the key skills."
              : "상대가 어떤 카드를 선택했는지 알 수 없기 때문에, 심리전과 패 읽기가 중요한 요소가 됩니다."}
          </p>
        </Section>

        {/* 4. IA(정보 구매) */}
        <Section
          title={
            isEn
              ? "IA (Information Acquisition) — River only"
              : "IA (Information Acquisition) — 정보 구매 · 리버 한정"
          }
          emoji="🔍"
        >
          <p>
            {isEn ? (
              <>
                <strong className="text-zinc-100">IA</strong> stands for{" "}
                <em>Information Acquisition</em>. It can only be used during the
                river betting round (after the final community card is revealed).
              </>
            ) : (
              <>
                <strong className="text-zinc-100">IA</strong>는{" "}
                <em>Information Acquisition(정보 구매)</em>의 줄임말입니다.
                리버(마지막 공용 카드 공개 후) 베팅 차례에서만 사용할 수 있습니다.
              </>
            )}
          </p>
          <p>
            {isEn ? (
              <>
                Using IA costs{" "}
                <Tag>30% of the pot (min {IA_COST_MIN_BB}bb)</Tag>, deducted from
                your own stack, and reveals the{" "}
                <strong className="text-zinc-100">
                  category of hand your opponent may hold.
                </strong>
              </>
            ) : (
              <>
                IA를 사용하면 본인 스택에서 칩{" "}
                <Tag>팟의 30% (최소 {IA_COST_MIN_BB}bb)</Tag>를 지불하고,{" "}
                <strong className="text-zinc-100">
                  상대방이 가질 수 있는 패의 종류(카테고리)
                </strong>
                를 확인합니다.
              </>
            )}
          </p>
          <p className="text-zinc-400">
            {isEn
              ? "Only a rough category is revealed (e.g. High Pair, Middle Pair, Broadway Suited etc.) — not the exact cards. Your action timer gains +10 seconds after using IA."
              : "정확한 패가 아닌 대략적인 카테고리(예: 하이파켓, 미들파켓, 브로드웨이 수딧 등)만 공개됩니다. 사용 후 해당 베팅 타이머가 10초 추가됩니다."}
          </p>
          <p>
            {isEn ? (
              <>
                If the amount you need to call exceeds your remaining stack after
                paying the IA cost, the call is treated as an{" "}
                <strong className="text-zinc-100">all-in for your remaining chips</strong>.
                The uncalled portion is returned to your opponent — no side pots
                in this 1v1 format.
              </>
            ) : (
              <>
                IA로 칩을 쓴 <strong className="text-zinc-100">뒤</strong>에
                맞춰야 할 금액이 남은 스택보다 크다면,{" "}
                <strong className="text-zinc-100">콜</strong>은{" "}
                <em>가진 스택만큼만</em> 실리는 부분 올인 콜로 처리됩니다. 상대가
                건 금액 중 맞추지 못한{" "}
                <strong className="text-zinc-100">나머지(언콜분)</strong>는 팟에
                남지 않고 <strong className="text-zinc-100">상대 스택으로 돌아갑니다</strong>
                (이 게임은 1:1·사이드 팟 없음과 같은 방식).
              </>
            )}
          </p>
        </Section>

        {/* 5. 온라인 멀티플레이 */}
        <Section title={isEn ? "Online Multiplayer" : "온라인 대전"} emoji="🌐">
          <p>
            {isEn ? (
              <>
                From the home screen, select{" "}
                <strong className="text-zinc-100">Multiplayer</strong> to choose
                between creating a private room (invite link) or a public room
                (visible in the room list).
              </>
            ) : (
              <>
                홈 화면에서 <strong className="text-zinc-100">멀티플레이</strong>를 누르면
                비공개 방(초대 링크)과 공개 방(목록 공개) 중 선택할 수 있습니다.
              </>
            )}
          </p>
          <p>
            {isEn
              ? "Private room: share the invite link with your opponent — no room code needed. Public room: listed in the public room browser for anyone to join."
              : "비공개 방은 링크를 상대에게 보내면 바로 입장됩니다. 공개 방은 공개 방 목록에 표시되어 누구나 찾아 입장할 수 있습니다."}
          </p>
          <p className="text-zinc-400">
            {isEn
              ? "Your opponent's hole cards are never sent to your device until the final showdown, ensuring a fair, leak-free game."
              : "상대방의 카드는 최종 쇼다운(패 비교) 전까지 절대 이 기기로 전달되지 않아, 정보 유출 없이 공정하게 진행됩니다."}
          </p>
        </Section>

        {/* 6. 베팅 구조 */}
        <Section title={isEn ? "Betting Structure" : "베팅 구조"} emoji="💰">
          <p>
            {isEn ? (
              <>
                Each round one player is the <Tag>Dealer (SB)</Tag> and the other
                is the <Tag>BB</Tag>.
              </>
            ) : (
              <>
                각 라운드에서 한 명은{" "}
                <Tag>딜러(SB)</Tag>, 상대는{" "}
                <Tag>BB</Tag> 역할을 맡습니다.
              </>
            )}
          </p>
          <ul className="space-y-1.5 pl-1 text-zinc-400">
            <li>
              <span className="font-medium text-zinc-200">
                {isEn ? "Preflop (before community cards)" : "프리플랍(공용 카드 공개 전)"}
              </span>{" "}
              —{" "}
              {isEn
                ? "Dealer (SB) acts first. Options: call · raise · fold (fold may be restricted when facing a bet)."
                : "딜러(SB)가 먼저 베팅합니다. 콜·레이즈·폴드 중 선택(맞춰야 할 상황에서는 폴드가 막힐 수 있음)."}
            </li>
            <li>
              <span className="font-medium text-zinc-200">
                {isEn ? "Flop · Turn · River (after community cards)" : "플랍·턴·리버(공용 카드 공개 후)"}
              </span>{" "}
              —{" "}
              {isEn
                ? "BB acts first. Options: check · bet · call · raise · fold."
                : "BB(상대방)가 먼저 액션합니다. 체크·베팅·콜·레이즈·폴드 중 선택."}
            </li>
            <li>
              <span className="font-medium text-zinc-200">
                {isEn ? "No pot cap (stack-limited)" : "팟 상한 없음 (스택 한도)"}
              </span>{" "}
              —{" "}
              {isEn ? (
                <>
                  Voluntary bets are limited only by your stack (no pot cap).
                </>
              ) : (
                <>
                  자발 베팅은 팟 상한 없이, 스택이 허용하는 범위까지 자유롭게 진행됩니다.
                </>
              )}
            </li>
            <li>
              <span className="font-medium text-zinc-200">
                {isEn ? "No max bet cap (stack-limited)" : "포스트플랍 상한 없음 (스택 한도)"}
              </span>{" "}
              —{" "}
              {isEn
                ? "Maximum bet/raise size is limited only by your stack."
                : "최대 베팅/레이즈 금액은 팟이 아니라 내 스택으로만 제한됩니다."}
            </li>
            <li>
              <span className="font-medium text-zinc-200">
                {isEn ? "Unlimited raises" : "레이즈 횟수 제한 없음"}
              </span>{" "}
              —{" "}
              {isEn ? (
                <>
                  There is no raise cap per street. Betting ends when a bet is matched
                  (or someone folds / all-in).
                </>
              ) : (
                <>
                  프리플랍·플랍·턴·리버에서 레이즈 횟수에 제한이 없습니다.
                  베팅은 콜되어 매칭되거나(또는 폴드 / 올인) 종료됩니다.
                </>
              )}
            </li>
            <li>
              <span className="font-medium text-zinc-200">
                {isEn ? "Partial call & uncalled bet" : "부분 콜(스택 부족)과 언콜"}
              </span>{" "}
              —{" "}
              {isEn
                ? "If your remaining stack is less than the amount to call, you go all-in for what you have. The excess is returned to your opponent (no side pots in 1v1)."
                : "남은 스택이 콜 금액보다 적으면 남은 칩 전부만 콜됩니다. 초과분은 상대에게 환급됩니다(1:1·사이드 팟 없음)."}
            </li>
            <li>
              {isEn
                ? "The dealer button switches every round."
                : "매 라운드가 끝날 때마다 딜러 역할이 바뀝니다."}
            </li>
          </ul>
          <p className="text-zinc-400">
            {isEn ? (
              <>
                You can go all-in preflop at any stack size. After an all-in, the
                remaining streets run out to showdown.
              </>
            ) : (
              <>
                스택 크기와 상관없이 프리플랍에서 전액 올인을 선택할 수 있습니다.
                올인 이후에는 남은 보드가 공개되어 쇼다운까지 진행됩니다.
              </>
            )}
          </p>
        </Section>

        {/* 7. 패의 등급 */}
        <Section
          title={isEn ? "Hand Rankings (strongest first)" : "패의 등급 (강한 순)"}
          emoji="🃏"
        >
          <ol className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-zinc-400 sm:grid-cols-3">
            {handRanks.map((rank, i) => (
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
            {isEn ? "Start Practice Game →" : "연습 게임 시작하기 →"}
          </Link>
          <Link
            href="/holdem"
            className="rounded-xl border border-zinc-600/60 bg-zinc-800/40 px-4 py-3 text-sm font-semibold text-zinc-200 hover:bg-zinc-800/70 active:scale-[0.98]"
          >
            {isEn ? "Home" : "홈으로"}
          </Link>
        </div>
      </div>
    </div>
  );
}
