import assert from "node:assert/strict";
import { HAND_RANK } from "../src/holdem/pokerEval";
import { bountyRewardForSeatCount } from "../src/mysteryHoldem/config";
import { findMissionDef } from "../src/mysteryHoldem/mysteryMissions";
import { resolveMissionReward } from "../src/mysteryHoldem/missionRewards";
import { potLimitMaxRaiseDisplay } from "../src/mysteryHoldem/selectors";
import {
  autoCompleteHandSetup,
  dispatch,
  makeMissionCtx,
  missionStateOf,
  mulberry32,
  startMatch,
} from "./mysteryTestHelpers";
import type { MysteryGameState, Seat } from "../src/mysteryHoldem/types";

/**
 * Mystery Card 미션형 8장 검증(§6~§9, §12~§13, §15~§16).
 *
 * 대부분은 순수 condition/rewardFor 판정이라 컨텍스트만 만들어 직접 확인한다.
 * Bounty Hunter처럼 reducer의 정산 단계와 엮인 카드만 실제 게임을 돌려 검증한다.
 */

// ─────────────── Maker 계열: 정확히 그 족보만 ───────────────
{
  const straight = findMissionDef("maker_straight")!;
  const hv = (rank: number) => ({ rank, kickers: [10, 9, 8, 7, 6] });

  assert.equal(straight.condition(makeMissionCtx({ bestHandValue: hv(HAND_RANK.STRAIGHT) })), true);
  assert.equal(
    straight.condition(makeMissionCtx({ bestHandValue: hv(HAND_RANK.FLUSH) })),
    false,
    "스트레이트가 플러시로 발전하면 Straight Maker는 실패한다(§7)",
  );
  assert.equal(straight.condition(makeMissionCtx({ bestHandValue: hv(HAND_RANK.TWO_PAIR) })), false);
  // 승패는 관계없다 — 지고도 성공한다.
  assert.equal(
    straight.condition(makeMissionCtx({ bestHandValue: hv(HAND_RANK.STRAIGHT), wonAnyPot: false })),
    true,
  );
  // 쇼다운에 도달하지 못하면 족보와 무관하게 실패한다.
  assert.equal(
    straight.condition(makeMissionCtx({ bestHandValue: hv(HAND_RANK.STRAIGHT), wentToShowdown: false })),
    false,
  );
  // 보드에 깔린 스트레이트를 그대로 쓴 경우는 인정하지 않는다 — 내 홀카드가 만든 족보가 아니다.
  assert.equal(
    straight.condition(
      makeMissionCtx({ bestHandValue: hv(HAND_RANK.STRAIGHT), improvesOnBoard: false }),
    ),
    false,
    "보드 스트레이트를 그대로 쓰면 Straight Maker는 실패한다",
  );
  assert.equal(
    findMissionDef("maker_flush")!.condition(
      makeMissionCtx({ bestHandValue: hv(HAND_RANK.FLUSH), improvesOnBoard: false }),
    ),
    false,
    "보드 플러시를 그대로 쓰면 Flush Maker는 실패한다",
  );

  // Maker 구간은 스티플을 뺀 모든 족보에서 겹치지 않는다.
  //
  // 스티플만 예외로 여러 장이 동시에 성공한다. 스티플은 스트레이트이면서 플러시이고
  // 풀하우스 이상이기도 한데, 이걸 실패로 처리하면 "노리던 족보를 더 크게 만들었더니
  // 미션이 깨지는" 함정이 된다.
  const makers = ["maker_straight", "maker_flush", "maker_high_end"].map(
    (id) => findMissionDef(id)!,
  );
  for (const rank of Object.values(HAND_RANK)) {
    if (rank === HAND_RANK.STRAIGHT_FLUSH) continue;
    const hit = makers.filter((m) => m.condition(makeMissionCtx({ bestHandValue: hv(rank) })));
    assert.ok(hit.length <= 1, `족보 ${rank}에서 ${hit.map((m) => m.id).join(",")}가 동시에 성공한다`);
  }

  // 스티플은 스트레이트·플러시·High-End 세 장 모두를 성공시킨다.
  {
    const sf = makeMissionCtx({ bestHandValue: hv(HAND_RANK.STRAIGHT_FLUSH) });
    assert.equal(findMissionDef("maker_straight")!.condition(sf), true, "스티플은 스트레이트로 인정");
    assert.equal(findMissionDef("maker_flush")!.condition(sf), true, "스티플은 플러시로 인정");
    assert.equal(findMissionDef("maker_high_end")!.condition(sf), true);
  }
}

// ─────────────── High-End Maker: 명시적 보상표 ───────────────
{
  const def = findMissionDef("maker_high_end")!;
  const paid = (rank: number) =>
    resolveMissionReward(def, makeMissionCtx({ bestHandValue: { rank, kickers: [] } }));
  assert.equal(paid(HAND_RANK.FULL_HOUSE), 350);
  assert.equal(paid(HAND_RANK.QUADS), 600);
  assert.equal(paid(HAND_RANK.STRAIGHT_FLUSH), 1000);
}

// ─────────────── Blind Defender: 시작 인원 × 10 ───────────────
{
  const def = findMissionDef("blind_defender")!;
  for (const position of ["SB", "BB"] as const) {
    assert.equal(def.condition(makeMissionCtx({ position, wonAnyPot: true })), true);
    // 상대 전원 폴드로 얻은 팟도 인정한다(쇼다운 불필요).
    assert.equal(
      def.condition(makeMissionCtx({ position, wonAnyPot: true, wentToShowdown: false })),
      true,
    );
  }
  assert.equal(def.condition(makeMissionCtx({ position: "BTN", wonAnyPot: true })), false);
  assert.equal(def.condition(makeMissionCtx({ position: "BB", wonAnyPot: false })), false);

  for (const [seats, expected] of [[3, 30], [4, 40], [6, 60], [10, 100]] as const) {
    assert.equal(
      resolveMissionReward(def, makeMissionCtx({ position: "BB", initialSeatCount: seats })),
      expected,
      `${seats}인 시작이면 ${expected}점`,
    );
  }
}

// ─────────────── Blind Defender: 버스트로 생존자가 줄어도 보상은 그대로 ───────────────
// initialSeatCount는 좌석 배열 길이(= 시작 인원)에서 오고, 버스트해도 배열은 줄지 않는다.
{
  const rng = mulberry32(11);
  let state = startMatch(10, rng);
  state = autoCompleteHandSetup(state, rng);
  const staged: MysteryGameState = {
    ...state,
    phase: "hand_over",
    players: state.players.map((p) => (p.seat < 5 ? { ...p, chips: 0, busted: true } : p)),
  };
  const next = dispatch(staged, { type: "START_NEXT_HAND" }, rng);
  assert.equal(next.players.filter((p) => !p.busted).length, 5, "5명만 생존한 상태를 만든다");
  assert.equal(next.seatCount, 10, "seatCount는 시작 인원 그대로여야 한다");
  assert.equal(
    resolveMissionReward(
      findMissionDef("blind_defender")!,
      makeMissionCtx({ position: "BB", initialSeatCount: next.seatCount }),
    ),
    100,
    "5명이 버스트해도 10인 시작 기준 100점을 유지한다(§12)",
  );
}

// ─────────────── Underdog: 해당 팟 참가자 중 (공동) 최하위 ───────────────
{
  const def = findMissionDef("underdog")!;
  const wonPot = (seats: Seat[]) => [{ amount: 1000, showdownSeats: seats }];

  // 단독 최하위 + 승리 → 성공
  assert.equal(
    def.condition(
      makeMissionCtx({
        seat: 0,
        wonAnyPot: true,
        wonPots: wonPot([0, 1, 2]),
        myPreflopScore: 7,
        opponentPreflopScores: { 1: 10, 2: 12 },
      }),
    ),
    true,
  );

  // 공동 최하위 + 승리 → 성공(§13)
  assert.equal(
    def.condition(
      makeMissionCtx({
        seat: 0,
        wonAnyPot: true,
        wonPots: wonPot([0, 1, 2]),
        myPreflopScore: 7,
        opponentPreflopScores: { 1: 7, 2: 12 },
      }),
    ),
    true,
  );

  // 나보다 약한 상대가 있으면 실패
  assert.equal(
    def.condition(
      makeMissionCtx({
        seat: 0,
        wonAnyPot: true,
        wonPots: wonPot([0, 1, 2]),
        myPreflopScore: 7,
        opponentPreflopScores: { 1: 5, 2: 12 },
      }),
    ),
    false,
  );

  // 팟별 판정: 메인 팟(강한 상대 포함)에서는 최하위가 아니지만, 내가 이긴 사이드 팟에서는
  // 최하위다 → 성공. "핸드 전체 참가자" 기준이었다면 실패했을 상황이다.
  assert.equal(
    def.condition(
      makeMissionCtx({
        seat: 0,
        wonAnyPot: true,
        wonPots: wonPot([0, 2]),
        myPreflopScore: 7,
        opponentPreflopScores: { 1: 3, 2: 12 },
      }),
    ),
    true,
    "내가 가져간 팟의 참가자만 비교해야 한다(§13 Side Pot)",
  );

  // 겨룬 상대가 없는 팟(단독 자격)은 Underdog이 아니다.
  assert.equal(
    def.condition(makeMissionCtx({ seat: 0, wonAnyPot: true, wonPots: wonPot([0]) })),
    false,
  );

  // 팟을 못 이기면 최하위여도 실패
  assert.equal(
    def.condition(makeMissionCtx({ seat: 0, wonAnyPot: false, wonPots: [], myPreflopScore: 1 })),
    false,
  );
}

// ─────────────── Ace High Like a Boss: 메이드 없이 하이카드로 승리 ───────────────
{
  const def = findMissionDef("high_card_boss")!;
  const highCard = { rank: HAND_RANK.HIGH_CARD, kickers: [14, 12, 9, 7, 5] };

  // 플랍에서 폴드 승리 — 쇼다운에 가지 않아도 성공한다(§15).
  assert.equal(
    def.condition(
      makeMissionCtx({ wonAnyPot: true, wentToShowdown: false, boardRevealed: 3, bestHandValue: highCard }),
    ),
    true,
  );
  // 리버 쇼다운 승리
  assert.equal(
    def.condition(makeMissionCtx({ wonAnyPot: true, boardRevealed: 5, bestHandValue: highCard })),
    true,
  );
  // 프리플랍 올폴드(보드 0장)는 인정하지 않는다
  assert.equal(
    def.condition(
      makeMissionCtx({ wonAnyPot: true, wentToShowdown: false, boardRevealed: 0, bestHandValue: highCard }),
    ),
    false,
    "커뮤니티 카드가 한 장도 없으면 실패한다(§15)",
  );
  // 원페어 이상이면 실패
  assert.equal(
    def.condition(
      makeMissionCtx({
        wonAnyPot: true,
        boardRevealed: 5,
        bestHandValue: { rank: HAND_RANK.PAIR, kickers: [5] },
      }),
    ),
    false,
  );
  // 이기지 못하면 실패
  assert.equal(
    def.condition(makeMissionCtx({ wonAnyPot: false, boardRevealed: 5, bestHandValue: highCard })),
    false,
  );
  assert.equal(def.reward, 500);
  // 보드 하이카드를 그대로 쓴 승리는 인정하지 않는다.
  assert.equal(
    def.condition(
      makeMissionCtx({ wonAnyPot: true, boardRevealed: 5, bestHandValue: highCard, improvesOnBoard: false }),
    ),
    false,
    "보드 하이카드를 그대로 쓰면 실패한다",
  );
}

// ─────────────── Bounty Hunter: 최종 Bounty Reward 자체가 ×3 ───────────────
{
  const def = findMissionDef("bounty_hunter")!;
  assert.equal(def.bountyMultiplier, 3);
  assert.equal(def.reward, 0, "별도 Mission Point는 지급하지 않는다(§16)");
  assert.equal(def.condition(makeMissionCtx({ bountyShare: 40 })), true);
  assert.equal(def.condition(makeMissionCtx({ bountyShare: 0 })), false);
}

// ─────────────── Bounty Hunter: reducer 실경로에서 실제로 ×3이 지급된다 ───────────────
// 3인 테이블에서 한 명은 폴드시켜 매치 종료를 피하고, 남은 둘을 올인 대결시킨다.
// 승자에게 Bounty Hunter를 쥐여준 경우와 아닌 경우의 지급액을 직접 비교한다.
{
  const hunterDef = findMissionDef("bounty_hunter")!;

  function playBustHand(giveBountyHunterTo: "winner" | "none"): number | null {
    for (let seed = 1; seed <= 200; seed++) {
      const rng = mulberry32(seed);
      let state = startMatch(3, rng);
      state = autoCompleteHandSetup(state, rng);
      if (state.phase !== "preflop" || state.toActSeat == null) continue;

      state = dispatch(state, { type: "FOLD", seat: state.toActSeat }, rng);
      if (state.phase !== "preflop" || state.toActSeat == null) continue;

      const shover = state.toActSeat;
      // Pot Limit이라 스택이 상한보다 깊으면 올인 자체가 불법이다. 이 테스트의 주제는
      // Bounty 배수이지 베팅 상한이 아니므로 스택을 합법 상한에 맞춘다.
      const potMax = potLimitMaxRaiseDisplay(state, shover);
      const street = state.players.find((p) => p.seat === shover)!.streetContribution;
      state = {
        ...state,
        players: state.players.map((p) =>
          p.seat === shover ? { ...p, chips: potMax - street } : p,
        ),
      };
      state = dispatch(state, { type: "ALL_IN", seat: shover }, rng);
      if (state.toActSeat == null) continue;
      const caller = state.toActSeat;

      // 두 대결자 모두에게 Bounty Hunter를 쥐여준다 — 어느 쪽이 이기든 배수가 적용된다.
      if (giveBountyHunterTo === "winner") {
        state = {
          ...state,
          players: state.players.map((p) =>
            p.seat === shover || p.seat === caller ? { ...p, mission: missionStateOf(hunterDef) } : p,
          ),
        };
      }
      state = dispatch(state, { type: "CALL", seat: caller }, rng);
      if (state.phase !== "hand_over") continue;

      const bustedSeats = state.players.filter((p) => p.busted).map((p) => p.seat);
      if (bustedSeats.length !== 1) continue;

      const log = state.logs.find((l) => l.t === "bounty_awarded");
      if (log == null || log.t !== "bounty_awarded") continue;
      // 대결에 참여한 좌석이 받은 Bounty만 본다(폴드한 방관자는 귀속 대상이 아니다).
      assert.ok(log.seat === shover || log.seat === caller);
      return log.reward;
    }
    return null;
  }

  const base = bountyRewardForSeatCount(3);
  const plain = playBustHand("none");
  const hunted = playBustHand("winner");
  assert.ok(plain != null && hunted != null, "버스트가 발생하는 시드를 찾지 못했다");
  assert.equal(plain, base, `Bounty Hunter가 없으면 기본 Bounty(${base})가 지급된다`);
  assert.equal(hunted, base * 3, `Bounty Hunter 보유 시 ${base} → ${base * 3}`);
}

// ─────────────── 미션형 카드가 전부 미션형으로 선언되어 있다 ───────────────
{
  const missionCardIds = [
    "maker_straight", "maker_flush", "maker_high_end",
    "blind_defender", "underdog", "high_card_boss", "bounty_hunter",
  ];
  for (const id of missionCardIds) {
    const def = findMissionDef(id);
    assert.ok(def != null, `${id} 카드가 풀에 없습니다`);
    assert.equal(def!.category, "mission", `${id}는 미션형이어야 합니다`);
    assert.equal(def!.replacementRule, "on_success", `${id}는 성공 시 교체되어야 합니다(§3)`);
  }
}

// Set Miner는 삭제됐다 — 조건이 애매하고 기대 점수도 낮았다.
assert.equal(findMissionDef("maker_set"), undefined, "Set Miner는 풀에서 제거되어야 한다");

console.log("OK: mystery card 미션형 7장");
