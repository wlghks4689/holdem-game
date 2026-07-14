/**
 * HARD · 리버 전용 경량 EV 근사 (헤즈업 2인)
 * ─ IA 카테고리(또는 풀 기반 사전)로 상대 핸드 범위를 열거해 에쿼티 계산
 * ─ 보드·내 홀에 이미 나온 카드 조합은 제외
 */
import type { Card } from "./cards";
import {
  effectiveCallPay,
  facingFor,
  headsUpSubBbVoluntaryEnabled,
  iaAppliedCostFromStack,
  isVoluntaryBetAmount,
  levelFromContributions,
  postflopMaxOpenBetForActor,
  postflopMinRaiseTargetForActor,
  postflopRaiseTargetCappedByOpponent,
  roundHalfChip,
  streetRaiseCapReached,
} from "./bettingHelpers";
import { SMALLEST_CHIP } from "./constants";
import { resolveHandBlinds } from "./blindLevels";
import { allConcreteHolesForTemplate, getHandTemplatesForMode } from "./handPool";
import { best5Of7, compareHandValue } from "./pokerEval";
import type { GameAction, GameState, OpponentHandCategory, PlayerIndex } from "./types";

const CHIP_EPS = 1e-6;

export function otherSeat(p: PlayerIndex): PlayerIndex {
  return (p === 0 ? 1 : 0) as PlayerIndex;
}

function cardKey(c: Card): string {
  return `${c.rank}:${c.suit}`;
}

function usedCardSet(hero: [Card, Card], board: readonly Card[]): Set<string> {
  const s = new Set<string>();
  for (const c of hero) s.add(cardKey(c));
  for (const c of board) s.add(cardKey(c));
  return s;
}

function holeDisjoint(h: [Card, Card], used: Set<string>): boolean {
  return !used.has(cardKey(h[0]!)) && !used.has(cardKey(h[1]!));
}

export type WeightedHole = { hole: [Card, Card]; weight: number };

/**
 * 상대(opp) 핸드 풀 잔량 × 템플릿 내 균등을 가중치로 한 상대 홀 후보.
 * `categoryFilter`가 있으면 해당 IA 카테고리 템플릿만 사용.
 */
export function buildWeightedOpponentHoles(
  state: GameState,
  aiSeat: PlayerIndex,
  categoryFilter: OpponentHandCategory | null,
): WeightedHole[] {
  const opp = otherSeat(aiSeat);
  const pool = state.handPoolRemaining[opp];
  const hero = state.holes[aiSeat]?.hole;
  if (!hero) return [];
  const br =
    state.phase === "river"
      ? state.board.length
      : Math.min(state.boardRevealed, state.board.length);
  const boardKnown = state.board.slice(0, br);
  const used = usedCardSet(hero, boardKnown);

  const out: WeightedHole[] = [];
  for (const t of getHandTemplatesForMode(state.gameMode)) {
    if (categoryFilter != null && t.iaCategory !== categoryFilter) continue;
    const rem = pool[t.id] ?? 0;
    if (rem <= 0) continue;
    const holes = allConcreteHolesForTemplate(t).filter((h) =>
      holeDisjoint(h, used),
    );
    if (holes.length === 0) continue;
    const wEach = rem / holes.length;
    for (const h of holes) {
      out.push({ hole: h, weight: wEach });
    }
  }
  return out;
}

export function totalWeight(range: readonly WeightedHole[]): number {
  return range.reduce((s, x) => s + (x.weight > 0 ? x.weight : 0), 0);
}

export type EquityBreakdown = {
  equity: number;
  winW: number;
  tieW: number;
  loseW: number;
  tw: number;
};

export function equityVsWeightedRange(
  heroHole: [Card, Card],
  board: readonly Card[],
  range: readonly WeightedHole[],
): EquityBreakdown {
  const hv = best5Of7([...heroHole, ...board]);
  let winW = 0;
  let tieW = 0;
  let loseW = 0;
  let tw = 0;
  for (const { hole, weight } of range) {
    if (weight <= 0) continue;
    const ov = best5Of7([...hole, ...board]);
    const c = compareHandValue(hv, ov);
    tw += weight;
    if (c > 0) winW += weight;
    else if (c === 0) tieW += weight;
    else loseW += weight;
  }
  if (tw <= 1e-15) {
    return { equity: 0.5, winW: 0, tieW: 0, loseW: 0, tw: 0 };
  }
  return {
    equity: (winW + 0.5 * tieW) / tw,
    winW,
    tieW,
    loseW,
    tw,
  };
}

function withVirtualPot(s: GameState, pot: number): GameState {
  return { ...s, pot: roundHalfChip(pot) };
}

function snapRaiseTargets(
  minT: number,
  maxT: number,
  bb: number,
  allowSubBb: boolean,
): number[] {
  const s = new Set<number>();
  const add = (x: number) => {
    const r = roundHalfChip(x);
    if (r + CHIP_EPS < minT || r > maxT + CHIP_EPS) return;
    if (!isVoluntaryBetAmount(r, bb, allowSubBb)) return;
    s.add(r);
  };
  add(minT);
  add(maxT);
  add(roundHalfChip((minT + maxT) / 2));
  if (maxT - minT > bb * 2 - CHIP_EPS) {
    add(roundHalfChip(minT + (maxT - minT) * 0.35));
    add(roundHalfChip(minT + (maxT - minT) * 0.65));
  }
  return [...s].sort((a, b) => a - b);
}

function openBetCandidates(statePot: GameState): number[] {
  const bb = resolveHandBlinds(statePot).bb;
  const maxB = postflopMaxOpenBetForActor(statePot);
  const allowSub = headsUpSubBbVoluntaryEnabled(statePot);
  const minB = allowSub ? SMALLEST_CHIP : bb;
  if (maxB + CHIP_EPS < minB) return [];
  const pot = statePot.pot;
  const s = new Set<number>();
  const add = (x: number) => {
    const r = roundHalfChip(x);
    if (r + CHIP_EPS < minB || r > maxB + CHIP_EPS) return;
    if (!isVoluntaryBetAmount(r, bb, allowSub)) return;
    s.add(r);
  };
  add(minB);
  add(bb);
  add(maxB);
  add(roundHalfChip(pot * 0.33));
  add(roundHalfChip(pot * 0.5));
  add(roundHalfChip(pot * 0.66));
  return [...s].sort((a, b) => a - b);
}

function isLegalPostflopRaiseTo(state: GameState, targetRaw: number): boolean {
  const p = state.toAct;
  if (p == null) return false;
  if (streetRaiseCapReached(state.betting)) return false;
  const f = facingFor(p, state.betting);
  if (f <= 1e-9) return false;
  const cap = postflopRaiseTargetCappedByOpponent(state);
  const minTarget = postflopMinRaiseTargetForActor(state);
  const bbUnit = resolveHandBlinds(state).bb;
  const target = roundHalfChip(targetRaw);
  const contributed = state.betting.contributed[p]!;
  const add = roundHalfChip(target - contributed);
  if (add <= 1e-9 || add > state.chips[p]! + CHIP_EPS) return false;

  const level = levelFromContributions(state.betting);
  // 레이즈는 "현재 레벨 초과"여야 함
  if (target <= level + CHIP_EPS) return false;

  const allInRaise = add >= state.chips[p]! - CHIP_EPS;
  // 노리밋: 올인 레이즈는 최소 레이즈 미만이어도 허용
  if (allInRaise) {
    return target <= cap + CHIP_EPS;
  }

  const allowSub = headsUpSubBbVoluntaryEnabled(state);
  if (!isVoluntaryBetAmount(target, bbUnit, allowSub)) return false;
  if (target > cap + CHIP_EPS || target + CHIP_EPS < minTarget) return false;
  return true;
}

/** 리버 레이즈 T 도달 후(상대가 맞출 수 있는 만큼) 팟·히어로 추가 칩 */
function raisePotOutcome(
  state: GameState,
  aiSeat: PlayerIndex,
  potEff: number,
  targetT: number,
):
  | { ok: false }
  | { ok: true; potNew: number; heroPay: number } {
  const p = aiSeat;
  const o = otherSeat(p);
  const cp = state.betting.contributed[p]!;
  const co = state.betting.contributed[o]!;
  const heroPay = roundHalfChip(targetT - cp);
  if (heroPay <= 1e-9 || heroPay > state.chips[p]! + CHIP_EPS) return { ok: false };
  const oppNeed = roundHalfChip(targetT - co);
  const oppPay = roundHalfChip(Math.min(oppNeed, state.chips[o]!));
  return {
    ok: true,
    potNew: roundHalfChip(potEff + heroPay + oppPay),
    heroPay,
  };
}

export type RiverEvPick = { ev: number; action: GameAction };

/**
 * 리버에서 EV가 최대가 되는 액션(폴드·콜·레이즈 / 체크·베트).
 * `potEff`는 쇼다운 시점 팟 크기(IA 직후면 이미 차감된 팟).
 */
export function pickBestRiverEvAction(
  state: GameState,
  aiSeat: PlayerIndex,
  potEff: number,
  categoryFilter: OpponentHandCategory | null,
): RiverEvPick | null {
  if (state.phase !== "river") return null;
  const heroSel = state.holes[aiSeat];
  const board = state.board;
  if (!heroSel || board.length < 5) return null;

  const range = buildWeightedOpponentHoles(state, aiSeat, categoryFilter);
  if (totalWeight(range) <= 1e-12) return null;

  const { equity } = equityVsWeightedRange(heroSel.hole, board, range);

  const sPot = withVirtualPot(state, potEff);
  const bb = resolveHandBlinds(sPot).bb;
  const facing = facingFor(aiSeat, state.betting);

  if (facing > CHIP_EPS) {
    let bestEv = 0;
    let best: GameAction = { type: "FOLD" };

    const pay = effectiveCallPay(aiSeat, state);
    if (pay > CHIP_EPS) {
      const evCall = equity * roundHalfChip(potEff + pay) - pay;
      if (evCall > bestEv + CHIP_EPS) {
        bestEv = evCall;
        best = { type: "POSTFLOP_CALL" };
      }
    }

    if (!state.isAllIn && !streetRaiseCapReached(state.betting)) {
      const minR = postflopMinRaiseTargetForActor(sPot);
      const maxR = postflopRaiseTargetCappedByOpponent(sPot);
      const subBb = headsUpSubBbVoluntaryEnabled(sPot);
      if (minR <= maxR + CHIP_EPS) {
        for (const T of snapRaiseTargets(minR, maxR, bb, subBb)) {
          if (!isLegalPostflopRaiseTo(sPot, T)) continue;
          const out = raisePotOutcome(state, aiSeat, potEff, T);
          if (!out.ok) continue;
          const evR = equity * out.potNew - out.heroPay;
          if (evR > bestEv + CHIP_EPS) {
            bestEv = evR;
            best = { type: "POSTFLOP_RAISE", toLevelChips: T };
          }
        }
      } else {
        // 노리밋 미달이어도 올인 레이즈는 허용.
        const T = maxR;
        if (isLegalPostflopRaiseTo(sPot, T)) {
          const out = raisePotOutcome(state, aiSeat, potEff, T);
          if (out.ok) {
            const evR = equity * out.potNew - out.heroPay;
            if (evR > bestEv + CHIP_EPS) {
              bestEv = evR;
              best = { type: "POSTFLOP_RAISE", toLevelChips: T };
            }
          }
        }
      }
    }

    return { ev: bestEv, action: best };
  }

  let bestEvCheck = equity * roundHalfChip(potEff);
  let bestA: GameAction = { type: "POSTFLOP_CHECK" };

  if (!state.isAllIn && !state.betting.raiseDone) {
    for (const B of openBetCandidates(sPot)) {
      const potNew = roundHalfChip(potEff + 2 * B);
      const evB = equity * potNew - B;
      if (evB > bestEvCheck + CHIP_EPS) {
        bestEvCheck = evB;
        bestA = { type: "POSTFLOP_BET", amount: B };
      }
    }
  }

  return { ev: bestEvCheck, action: bestA };
}

/** 리버 라인 분류 — 솔버 혼합 정책용 */
export type RiverLineKind = "fold" | "call" | "raise" | "check" | "bet";

export type RiverLineCandidate = {
  kind: RiverLineKind;
  ev: number;
  action: GameAction;
};

/**
 * 리버에서 의미 있는 라인별 (EV, 액션) 열거 — Hell 솔버 테이블 혼합 샘플링용.
 * 같은 kind 여러 개(레이즈 사이즈 등)는 kind당 최고 EV 하나만 유지.
 */
export function enumerateRiverLineCandidates(
  state: GameState,
  aiSeat: PlayerIndex,
  potEff: number,
  categoryFilter: OpponentHandCategory | null,
): RiverLineCandidate[] {
  if (state.phase !== "river") return [];
  const heroSel = state.holes[aiSeat];
  const board = state.board;
  if (!heroSel || board.length < 5) return [];

  const range = buildWeightedOpponentHoles(state, aiSeat, categoryFilter);
  if (totalWeight(range) <= 1e-12) return [];

  const { equity } = equityVsWeightedRange(heroSel.hole, board, range);

  const sPot = withVirtualPot(state, potEff);
  const bb = resolveHandBlinds(sPot).bb;
  const facing = facingFor(aiSeat, state.betting);

  const byKind = new Map<RiverLineKind, RiverLineCandidate>();

  const put = (kind: RiverLineKind, ev: number, action: GameAction) => {
    const prev = byKind.get(kind);
    if (prev == null || ev > prev.ev + CHIP_EPS) {
      byKind.set(kind, { kind, ev, action });
    }
  };

  if (facing > CHIP_EPS) {
    const pay = effectiveCallPay(aiSeat, state);
    if (pay > CHIP_EPS) {
      const evCall = equity * roundHalfChip(potEff + pay) - pay;
      put("call", evCall, { type: "POSTFLOP_CALL" });
    }
    put("fold", 0, { type: "FOLD" });

    if (!state.isAllIn && !streetRaiseCapReached(state.betting)) {
      const minR = postflopMinRaiseTargetForActor(sPot);
      const maxR = postflopRaiseTargetCappedByOpponent(sPot);
      const subBb = headsUpSubBbVoluntaryEnabled(sPot);
      if (minR <= maxR + CHIP_EPS) {
        for (const T of snapRaiseTargets(minR, maxR, bb, subBb)) {
          if (!isLegalPostflopRaiseTo(sPot, T)) continue;
          const out = raisePotOutcome(state, aiSeat, potEff, T);
          if (!out.ok) continue;
          const evR = equity * out.potNew - out.heroPay;
          const prev = byKind.get("raise");
          const act: GameAction = { type: "POSTFLOP_RAISE", toLevelChips: T };
          if (prev == null || evR > prev.ev + CHIP_EPS) {
            byKind.set("raise", { kind: "raise", ev: evR, action: act });
          }
        }
      } else {
        // 노리밋 미달이어도 올인 레이즈는 허용
        const T = maxR;
        if (isLegalPostflopRaiseTo(sPot, T)) {
          const out = raisePotOutcome(state, aiSeat, potEff, T);
          if (out.ok) {
            const evR = equity * out.potNew - out.heroPay;
            const prev = byKind.get("raise");
            const act: GameAction = { type: "POSTFLOP_RAISE", toLevelChips: T };
            if (prev == null || evR > prev.ev + CHIP_EPS) {
              byKind.set("raise", { kind: "raise", ev: evR, action: act });
            }
          }
        }
      }
    }
  } else {
    put("check", equity * roundHalfChip(potEff), { type: "POSTFLOP_CHECK" });

    if (!state.isAllIn && !state.betting.raiseDone) {
      for (const B of openBetCandidates(sPot)) {
        const potNew = roundHalfChip(potEff + 2 * B);
        const evB = equity * potNew - B;
        const act: GameAction = { type: "POSTFLOP_BET", amount: B };
        const prev = byKind.get("bet");
        if (prev == null || evB > prev.ev + CHIP_EPS) {
          byKind.set("bet", { kind: "bet", ev: evB, action: act });
        }
      }
    }
  }

  return [...byKind.values()];
}

/**
 * HARD 리버: IA 기대이익 vs 비용(내 스택 차감) 비교.
 */
export function shouldAIUseIAHardEv(state: GameState, aiSeat: PlayerIndex): boolean {
  if (state.phase !== "river" || state.isAllIn) return false;
  const bb = resolveHandBlinds(state).bb;
  const P = state.pot;
  const C = iaAppliedCostFromStack(P, state.chips[aiSeat]!, bb);
  if (C <= CHIP_EPS || P <= C + CHIP_EPS) return false;

  const hero = state.holes[aiSeat]?.hole;
  const board = state.board;
  if (!hero || board.length < 5) return false;

  const fullRange = buildWeightedOpponentHoles(state, aiSeat, null);
  const tw = totalWeight(fullRange);
  if (tw <= 1e-12) return false;

  const breakdown = equityVsWeightedRange(hero, board, fullRange);
  const { equity, winW, tieW, loseW } = breakdown;

  const neverWins = winW + tieW <= 1e-12 * tw;
  const neverLoses = loseW <= 1e-12 * tw;
  if (neverWins || neverLoses) return false;

  const noShowdownValue = equity <= 1e-12;
  if (noShowdownValue) return false;

  const potAfter = roundHalfChip(P - C);
  const evNo = pickBestRiverEvAction(state, aiSeat, P, null);
  if (!evNo) return false;

  const categories = [
    ...new Set(
      getHandTemplatesForMode(state.gameMode).map((t) => t.iaCategory),
    ),
  ] as OpponentHandCategory[];

  let evIa = 0;
  for (const cat of categories) {
    const rCat = buildWeightedOpponentHoles(state, aiSeat, cat);
    const wCat = totalWeight(rCat);
    if (wCat <= 1e-12) continue;
    const pCat = wCat / tw;
    const pickCat = pickBestRiverEvAction(state, aiSeat, potAfter, cat);
    if (!pickCat) continue;
    evIa += pCat * pickCat.ev;
  }

  return evIa > evNo.ev + SMALLEST_CHIP * 0.05;
}
