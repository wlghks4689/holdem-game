import {
  blindContributionFromPreflopPost,
  bettingMatched,
  canActorPreflopRaise,
  facingFor,
  iaCostFromPot,
  totalIaChipsRemovedFromLogs,
  levelFromContributions,
  postflopMaxBet,
  postflopEffectiveMaxRaiseToLevel,
  preflopMaxPotChips,
  preflopMaxRaiseTargetForActor,
  preflopMinTotalRaiseForActor,
  isVoluntaryBetMultiple,
  postflopMinRaiseToLevelChips,
  roundHalfChip,
  splitPotTwoWayChopChips,
} from "./bettingHelpers";
import { handBlindsFromRound, resolveHandBlinds } from "./blindLevels";
import { dealAfterHoles } from "./deck";
import {
  findTemplate,
  initialPoolRemaining,
  normalizeHandPoolRemaining,
  resolvePendingHandPicks,
  selectedHandFrom,
  templateLabel,
} from "./handPool";
import { compareHandValue, best5Of7, handValueSummaryKorean } from "./pokerEval";
import { STARTING_CHIPS, TOTAL_ROUNDS } from "./constants";
import type {
  GameAction,
  GameMessage,
  GameState,
  PlayerIndex,
  Street,
} from "./types";

const other = (p: PlayerIndex): PlayerIndex => (p === 0 ? 1 : 0);

function ensureHandBlinds(s: GameState): void {
  if (
    !s.handBlinds ||
    typeof s.handBlinds.sb !== "number" ||
    typeof s.handBlinds.bb !== "number" ||
    typeof s.handBlinds.ante !== "number" ||
    Number.isNaN(s.handBlinds.bb) ||
    s.handBlinds.bb < 1e-9
  ) {
    s.handBlinds = handBlindsFromRound(s.roundNumber);
  }
}

function rng(): () => number {
  return () => Math.random();
}

function pushLog(s: GameState, m: GameMessage): void {
  s.logs = [...s.logs, m].slice(-80);
}

/** 팟 배분 후: 다음 라운드 블라인드를 낼 칩이 없으면 매치 즉시 종료(라운드 한도보다 우선) */
function bustCheck(s: GameState): boolean {
  if (s.phase !== "showdown" && s.phase !== "hand_over") return false;
  const c0 = s.chips[0]!;
  const c1 = s.chips[1]!;
  if (c0 <= 1e-9 && c1 <= 1e-9) {
    s.matchWinner = c0 >= c1 ? 0 : 1;
    pushLog(s, { t: "player_busted", player: 0 });
    pushLog(s, { t: "player_busted", player: 1 });
    return true;
  }
  if (c0 <= 1e-9) {
    s.matchWinner = 1;
    pushLog(s, { t: "player_busted", player: 0 });
    return true;
  }
  if (c1 <= 1e-9) {
    s.matchWinner = 0;
    pushLog(s, { t: "player_busted", player: 1 });
    return true;
  }
  return false;
}

function awardPot(s: GameState, winners: PlayerIndex[]): void {
  const pot = roundHalfChip(s.pot);
  if (pot <= 0 || winners.length === 0) {
    s.potAwardFlash = null;
    s.pot = 0;
    return;
  }
  const flash: [number, number] = [0, 0];
  if (winners.length === 1) {
    const w = winners[0]!;
    const l = other(w);
    s.chips[w]! += pot;
    flash[w] = pot;
    flash[l] = -pot;
  } else {
    const bbPlayer = other(s.button);
    const { share0, share1 } = splitPotTwoWayChopChips(pot, bbPlayer);
    s.chips[0]! += share0;
    s.chips[1]! += share1;
    flash[0] = share0;
    flash[1] = share1;
  }
  s.pot = 0;
  s.potAwardFlash = flash;
}

function freshBetting(): GameState["betting"] {
  return {
    contributed: [0, 0],
    currentLevel: 0,
    raiseDone: false,
    checksThisStreet: 0,
  };
}

function advanceStreet(s: GameState): void {
  const ord: Street[] = ["preflop", "flop", "turn", "river"];
  const i = ord.indexOf(s.phase as Street);
  if (i < 0 || i >= ord.length - 1) return;
  s.phase = ord[i + 1]!;
  s.betting = freshBetting();
  s.toAct = other(s.button);
  if (s.phase === "flop") s.boardRevealed = 3;
  if (s.phase === "turn") s.boardRevealed = 4;
  if (s.phase === "river") s.boardRevealed = 5;
  pushLog(s, {
    t: "street_cards",
    street: s.phase,
    cards: s.board.slice(0, s.boardRevealed),
    pot: s.pot,
  });
  s.lastActionNote = `${s.phase} — 헤즈업: BB 선행동`;
}

function goShowdown(s: GameState): void {
  s.isAllIn = false;
  const potBefore = s.pot;
  const h0 = s.holes[0]!.hole;
  const h1 = s.holes[1]!.hole;
  const board = s.board;
  const v0 = best5Of7([...h0, ...board]);
  const v1 = best5Of7([...h1, ...board]);
  const cmp = compareHandValue(v0, v1);
  const winners: PlayerIndex[] =
    cmp > 0 ? [0] : cmp < 0 ? [1] : [0, 1];
  awardPot(s, winners);
  const h0s = handValueSummaryKorean(v0);
  const h1s = handValueSummaryKorean(v1);
  const desc = `${h0s} vs ${h1s}`;
  pushLog(s, {
    t: "showdown",
    winners,
    pot: potBefore,
    desc,
    hands: [h0s, h1s],
  });
  s.winner = winners.length === 1 ? winners[0]! : null;
  s.handEndMode = "showdown";
  s.phase = "showdown";
  s.toAct = null;
  s.preflopStage = null;
  s.lastActionNote = desc;
  bustCheck(s);
}

function endHandFold(s: GameState, folder: PlayerIndex): void {
  s.isAllIn = false;
  const potBefore = s.pot;
  const w = other(folder);
  awardPot(s, [w]);
  pushLog(s, {
    t: "showdown",
    winners: [w],
    pot: potBefore,
    desc: "폴드",
    folder,
  });
  s.winner = w;
  s.handEndMode = "fold";
  s.phase = "hand_over";
  s.toAct = null;
  s.preflopStage = null;
  bustCheck(s);
}

function endPostflopStreet(s: GameState): void {
  if (s.phase === "river") goShowdown(s);
  else advanceStreet(s);
}

/**
 * 스택이 facing보다 작은 올인 콜 시 언콜분은 상대에게 환급(2인·사이드팟 없음).
 * @returns pay 실제 지불액, wentAllIn 호출 후 해당 플레이어 스택 0 여부
 */
function applyCallPayment(s: GameState, p: PlayerIndex): {
  pay: number;
  wentAllIn: boolean;
} {
  const f = facingFor(p, s.betting);
  const stackBefore = s.chips[p]!;
  const pay = roundHalfChip(Math.min(f, stackBefore));
  const q = other(p);
  s.chips[p]! -= pay;
  s.pot += pay;
  s.betting.contributed[p]! += pay;

  const cp = s.betting.contributed[p]!;
  const cq = s.betting.contributed[q]!;
  if (cq > cp) {
    const excess = roundHalfChip(cq - cp);
    s.betting.contributed[q]! = cp;
    s.chips[q]! += excess;
    s.pot -= excess;
  }
  s.betting.currentLevel = Math.max(
    s.betting.contributed[0]!,
    s.betting.contributed[1]!,
  );
  const wentAllIn = s.chips[p]! <= 1e-9;
  return { pay, wentAllIn };
}

/** 올인 콜 이후 남은 스트리트를 모두 공개하고 즉시 쇼다운 */
function runOutBoardToShowdown(s: GameState): void {
  s.isAllIn = true;
  const pushStreet = (revealed: number, street: Street) => {
    s.boardRevealed = revealed;
    pushLog(s, {
      t: "street_cards",
      street,
      cards: s.board.slice(0, s.boardRevealed),
      pot: s.pot,
    });
  };

  if (s.phase === "preflop") {
    s.phase = "flop";
    pushStreet(3, "flop");
    s.phase = "turn";
    pushStreet(4, "turn");
    s.phase = "river";
    pushStreet(5, "river");
  } else if (s.phase === "flop") {
    s.phase = "turn";
    pushStreet(4, "turn");
    s.phase = "river";
    pushStreet(5, "river");
  } else if (s.phase === "turn") {
    s.phase = "river";
    pushStreet(5, "river");
  } else if (s.phase === "river") {
    s.boardRevealed = 5;
  }
  s.lastActionNote = "올인 — 남은 보드 전부 개시 후 쇼다운";
  goShowdown(s);
}

/**
 * 블라인드(+BB측 앤티): 스택이 부족하면 가진 만큼만 포스트(언더 올인).
 * 짧은 쪽 기준으로 맞춘 뒤, 상대에게 언콜분 환급.
 */
function normalizeUncalledBlindExcess(s: GameState): void {
  const c0 = s.betting.contributed[0]!;
  const c1 = s.betting.contributed[1]!;
  if (Math.abs(c0 - c1) < 1e-9) {
    s.betting.currentLevel = Math.max(c0, c1);
    return;
  }

  const hiIdx: PlayerIndex = c0 > c1 ? 0 : 1;
  const loIdx: PlayerIndex = other(hiIdx);
  const hi = Math.max(c0, c1);
  const lo = Math.min(c0, c1);

  if (s.chips[loIdx]! > 1e-9) return;

  const excess = roundHalfChip(hi - lo);
  if (excess <= 1e-9) return;
  s.betting.contributed[hiIdx]! = lo;
  s.chips[hiIdx]! += excess;
  s.pot -= excess;
  s.betting.currentLevel = lo;
}

function startPreflopAfterHands(s: GameState, deckRng: () => number): void {
  const h0 = s.holes[0]!.hole;
  const h1 = s.holes[1]!.hole;
  s.board = dealAfterHoles(h0, h1, deckRng);
  s.boardRevealed = 0;
  ensureHandBlinds(s);
  const { sb, bb, ante } = s.handBlinds;
  const btn = s.button;
  const bbSeat = other(btn);
  /** 버튼: SB만. BB: 1BB + 앤티(1bb by default) */
  const needBtn = roundHalfChip(sb);
  const needBb = roundHalfChip(bb + ante);

  const postBtn = roundHalfChip(
    Math.min(Math.max(0, s.chips[btn]!), needBtn),
  );
  const postBb = roundHalfChip(
    Math.min(Math.max(0, s.chips[bbSeat]!), needBb),
  );

  s.chips[btn]! = roundHalfChip(s.chips[btn]! - postBtn);
  s.chips[bbSeat]! = roundHalfChip(s.chips[bbSeat]! - postBb);
  s.pot = roundHalfChip(postBtn + postBb);

  const contributed: [number, number] = [0, 0];
  contributed[btn] = blindContributionFromPreflopPost(postBtn, sb, 0);
  contributed[bbSeat] = blindContributionFromPreflopPost(postBb, bb, ante);

  s.betting = {
    contributed,
    currentLevel: Math.max(postBtn, postBb),
    raiseDone: false,
    checksThisStreet: 0,
  };

  normalizeUncalledBlindExcess(s);

  s.phase = "preflop";
  s.preflopStage = "button_acts";
  s.preflopRaiseCount = 0;
  s.toAct = s.button;
  s.handSelectPhase = "done";
  s.handPickPending = [null, null];
  s.isAllIn = false;
  s.lastActionNote = "프리플랍 — 딜러·SB (콜/레이즈)";
}

function syncIsAllInFlag(s: GameState): void {
  if (
    s.phase === "showdown" ||
    s.phase === "hand_over" ||
    s.phase === "hand_select"
  ) {
    s.isAllIn = false;
    return;
  }
  s.isAllIn = s.chips[0]! <= 1e-9 || s.chips[1]! <= 1e-9;
}

/** 스택 0인 차례는 체크만 가능한 상황에서 자동 체크·스트리트 진행 */
function settleZeroStackAutoActions(s: GameState): void {
  let guard = 0;
  while (guard++ < 64) {
    if (s.matchWinner != null) return;
    if (
      s.phase === "showdown" ||
      s.phase === "hand_over" ||
      s.phase === "hand_select"
    ) {
      return;
    }
    if (s.toAct == null) return;

    const p = s.toAct;
    if (s.chips[p]! > 1e-9) return;

    const f = facingFor(p, s.betting);
    if (f > 1e-9) return;

    if (s.phase === "preflop") {
      if (s.preflopStage === "bb_option" && p === other(s.button)) {
        pushLog(s, { t: "preflop_action", player: p, action: "체크(자동)" });
        advanceStreet(s);
        s.lastActionNote = "플랍";
        continue;
      }
      if (s.preflopStage === "button_acts" && p === s.button) {
        // SB가 언더 블라인드로 올인한 뒤 기여가 맞춰진 경우 — 액션 없이 런아웃
        if (s.chips[p]! <= 1e-9 && bettingMatched(s.betting)) {
          return;
        }
        s.preflopStage = "bb_option";
        s.toAct = other(s.button);
        s.lastActionNote = "BB 옵션 (체크/레이즈)";
        continue;
      }
      return;
    }

    if (s.phase === "flop" || s.phase === "turn" || s.phase === "river") {
      pushLog(s, { t: "postflop_action", player: p, action: "체크(자동)" });
      s.betting.checksThisStreet += 1;
      const opp = other(p);
      if (s.betting.checksThisStreet >= 2 && bettingMatched(s.betting)) {
        endPostflopStreet(s);
      } else {
        s.toAct = opp;
      }
      continue;
    }
    return;
  }
}

/**
 * 베팅이 맞았는데 한쪽 이상 스택 0 — 더 이상 베팅 없이 보드만 깔고 쇼다운.
 */
function maybeRunOutAfterAllInMatch(s: GameState): void {
  if (s.matchWinner != null) return;
  if (
    s.phase !== "preflop" &&
    s.phase !== "flop" &&
    s.phase !== "turn" &&
    s.phase !== "river"
  ) {
    return;
  }
  if (!bettingMatched(s.betting)) return;
  if (s.chips[0]! > 1e-9 && s.chips[1]! > 1e-9) return;
  runOutBoardToShowdown(s);
}

function postProcessLiveHand(s: GameState): void {
  if (s.matchWinner != null) return;
  settleZeroStackAutoActions(s);
  maybeRunOutAfterAllInMatch(s);
  settleZeroStackAutoActions(s);
  maybeRunOutAfterAllInMatch(s);
  syncIsAllInFlag(s);
}

function done(s: GameState): GameState {
  postProcessLiveHand(s);
  return s;
}

export function createInitialGameState(): GameState {
  return {
    phase: "hand_select",
    roundNumber: 1,
    handBlinds: handBlindsFromRound(1),
    button: 0,
    chips: [STARTING_CHIPS, STARTING_CHIPS],
    pot: 0,
    potAwardFlash: null,
    handPoolRemaining: [initialPoolRemaining(), initialPoolRemaining()],
    holes: [null, null],
    handPickPending: [null, null],
    board: [],
    boardRevealed: 0,
    betting: freshBetting(),
    toAct: null,
    handSelectPhase: "open",
    preflopStage: null,
    preflopRaiseCount: 0,
    iaUsed: [false, false],
    iaPotRemovalTotal: 0,
    iaReveal: [null, null],
    winner: null,
    handEndMode: null,
    matchWinner: null,
    logs: [{ t: "round_start", round: 1 }],
    lastActionNote: "양쪽 핸드 선택 (동시)",
    isAllIn: false,
  };
}

export function holdemReducer(
  state: GameState,
  action: GameAction,
  random: () => number = rng(),
): GameState {
  const s: GameState = structuredClone(state);
  ensureHandBlinds(s);
  s.isAllIn = s.isAllIn ?? false;
  s.handPoolRemaining = normalizeHandPoolRemaining(s.handPoolRemaining as unknown);
  if (typeof s.iaPotRemovalTotal !== "number" || Number.isNaN(s.iaPotRemovalTotal)) {
    s.iaPotRemovalTotal = totalIaChipsRemovedFromLogs(s.logs);
  }
  if (s.phase === "hand_select") {
    const rawHs = s.handSelectPhase as unknown;
    if (rawHs === "button" || rawHs === "bb") {
      s.handSelectPhase = "open";
      s.toAct = null;
    }
  }
  if (s.matchWinner != null) return state;

  switch (action.type) {
    case "SELECT_HAND": {
      if (s.phase !== "hand_select") return state;
      if (s.handSelectPhase === "done") return state;
      const p = action.player;
      const tpl = findTemplate(action.templateId);
      if (!tpl) return state;

      if ((s.handPoolRemaining[p]?.[action.templateId] ?? 0) <= 0) return state;

      s.handPickPending[p] = { templateId: action.templateId };

      const pending0 = s.handPickPending[0];
      const pending1 = s.handPickPending[1];
      if (pending0 == null || pending1 == null) {
        s.toAct = null;
        const a0 = pending0 != null;
        const a1 = pending1 != null;
        if (a0 !== a1) {
          s.lastActionNote = "한쪽 확정 — 상대 핸드 확정 대기";
        } else {
          s.lastActionNote = "양쪽 핸드 선택 (동시)";
        }
        return done(s);
      }

      const resolved = resolvePendingHandPicks(pending0, pending1, random);
      if (!resolved.ok) {
        s.handPickPending = [null, null];
        s.holes = [null, null];
        s.handSelectPhase = "open";
        s.toAct = null;
        pushLog(s, { t: "hand_pick_conflict" });
        s.lastActionNote = "선택 충돌 — 둘 다 다시 선택하세요.";
        return done(s);
      }

      const { hole0, hole1, t0, t1 } = resolved;
      s.holes[0] = selectedHandFrom(t0, hole0);
      s.holes[1] = selectedHandFrom(t1, hole1);
      const pool0 = s.handPoolRemaining[0];
      const pool1 = s.handPoolRemaining[1];
      if (pool0 && pool1) {
        pool0[t0.id] = (pool0[t0.id] ?? 0) - 1;
        pool1[t1.id] = (pool1[t1.id] ?? 0) - 1;
      }
      s.handPickPending = [null, null];
      pushLog(s, { t: "hand_chosen", player: 0, label: templateLabel(t0) });
      pushLog(s, { t: "hand_chosen", player: 1, label: templateLabel(t1) });
      startPreflopAfterHands(s, random);
      return done(s);
    }

    case "FOLD": {
      if (s.toAct == null) return state;
      if (s.phase === "preflop") {
        const p = s.toAct;
        if (facingFor(p, s.betting) <= 0) return state;
        endHandFold(s, p);
        return done(s);
      }
      endHandFold(s, s.toAct);
      return done(s);
    }

    case "PREFLOP_CHECK": {
      if (s.phase !== "preflop" || s.toAct == null || s.preflopStage !== "bb_option") return state;
      const p = s.toAct;
      if (p !== other(s.button)) return state;
      if (facingFor(p, s.betting) !== 0) return state;
      pushLog(s, { t: "preflop_action", player: p, action: "체크" });
      advanceStreet(s);
      s.lastActionNote = "플랍";
      return done(s);
    }


    case "PREFLOP_CALL": {
      if (s.phase !== "preflop" || s.toAct == null || s.preflopStage == null) return state;
      const p = s.toAct;
      const f = facingFor(p, s.betting);
      if (f <= 0 || s.chips[p]! <= 0) return state;
      const { pay, wentAllIn } = applyCallPayment(s, p);
      if (pay <= 0) return state;
      if (!wentAllIn && !bettingMatched(s.betting)) return state;
      const actionLabel = wentAllIn ? "올인 콜" : "콜";
      pushLog(s, { t: "preflop_action", player: p, action: actionLabel, amount: pay });

      if (wentAllIn) {
        runOutBoardToShowdown(s);
        return done(s);
      }

      if (s.preflopStage === "button_acts") {
        s.preflopStage = "bb_option";
        s.toAct = other(s.button);
        s.lastActionNote = "BB 옵션 (체크/레이즈)";
      } else if (s.preflopStage === "facing_raise" && bettingMatched(s.betting)) {
        advanceStreet(s);
        s.lastActionNote = "플랍";
      }
      return done(s);
    }

    case "PREFLOP_RAISE": {
      if (s.phase !== "preflop" || s.toAct == null || s.preflopStage == null) return state;
      const p = s.toAct;
      if (!canActorPreflopRaise(s)) return state;
      if (s.preflopRaiseCount >= 2) return state;

      const target = roundHalfChip(action.toLevelChips);
      const cur = s.betting.contributed[p]!;
      const add = target - cur;
      if (add <= 0 || add > s.chips[p]!) return state;
      const level = levelFromContributions(s.betting);
      if (target <= level) return state;

      const minT = preflopMinTotalRaiseForActor(s);
      const maxT = preflopMaxRaiseTargetForActor(s);
      const bbUnit = resolveHandBlinds(s).bb;
      if (!isVoluntaryBetMultiple(target, bbUnit)) return state;
      if (target < minT || target > maxT) return state;

      const potAfter = roundHalfChip(s.pot + add);
      if (potAfter > preflopMaxPotChips(s) + 1e-9) return state;

      s.chips[p]! -= add;
      s.pot = potAfter;
      s.betting.contributed[p]! = target;
      s.betting.currentLevel = target;
      s.preflopRaiseCount += 1;
      pushLog(s, { t: "preflop_action", player: p, action: "레이즈", amount: target });

      if (s.preflopStage === "button_acts") {
        s.preflopStage = "facing_raise";
        s.toAct = other(s.button);
        s.lastActionNote = "BB 응답 (콜/레이즈)";
      } else {
        s.preflopStage = "facing_raise";
        s.toAct = other(p);
        s.lastActionNote = "딜러·SB 응답 (콜만)";
      }
      return done(s);
    }

    case "POSTFLOP_CHECK": {
      if (!(s.phase === "flop" || s.phase === "turn" || s.phase === "river")) return state;
      if (s.toAct == null) return state;
      const p = s.toAct;
      if (facingFor(p, s.betting) > 0) return state;
      pushLog(s, { t: "postflop_action", player: p, action: "체크" });
      s.betting.checksThisStreet += 1;
      const opp = other(p);
      if (s.betting.checksThisStreet >= 2 && bettingMatched(s.betting)) {
        endPostflopStreet(s);
      } else {
        s.toAct = opp;
      }
      return done(s);
    }

    case "POSTFLOP_BET": {
      if (!(s.phase === "flop" || s.phase === "turn" || s.phase === "river")) return state;
      if (s.toAct == null) return state;
      const p = s.toAct;
      if (!bettingMatched(s.betting) || s.betting.raiseDone) return state;
      const amt = roundHalfChip(action.amount);
      const maxB = postflopMaxBet(s.pot, s.chips[p]!);
      const bbUnit = resolveHandBlinds(s).bb;
      if (
        amt < bbUnit ||
        amt > maxB ||
        !isVoluntaryBetMultiple(amt, bbUnit)
      ) {
        return state;
      }
      s.chips[p]! -= amt;
      s.pot += amt;
      s.betting.contributed[p]! += amt;
      s.betting.currentLevel = s.betting.contributed[p]!;
      s.betting.raiseDone = false;
      s.betting.checksThisStreet = 0;
      pushLog(s, { t: "postflop_action", player: p, action: "베트", amount: amt });
      s.toAct = other(p);
      return done(s);
    }

    case "POSTFLOP_CALL": {
      if (!(s.phase === "flop" || s.phase === "turn" || s.phase === "river")) return state;
      if (s.toAct == null) return state;
      const p = s.toAct;
      const f = facingFor(p, s.betting);
      if (f <= 0 || s.chips[p]! <= 0) return state;
      const { pay, wentAllIn } = applyCallPayment(s, p);
      if (pay <= 0) return state;
      const actionLabel = wentAllIn ? "올인 콜" : "콜";
      pushLog(s, { t: "postflop_action", player: p, action: actionLabel, amount: pay });
      if (wentAllIn) {
        runOutBoardToShowdown(s);
        return done(s);
      }
      if (bettingMatched(s.betting)) endPostflopStreet(s);
      return done(s);
    }

    case "POSTFLOP_RAISE": {
      if (!(s.phase === "flop" || s.phase === "turn" || s.phase === "river")) return state;
      if (s.toAct == null) return state;
      const p = s.toAct;
      if (s.betting.raiseDone) return state;
      const f = facingFor(p, s.betting);
      if (f <= 0) return state;
      const target = roundHalfChip(action.toLevelChips);
      const lv = levelFromContributions(s.betting);
      const cap = postflopEffectiveMaxRaiseToLevel(
        s.pot,
        f,
        s.betting.contributed[p]!,
        s.chips[p]!,
      );
      const minTarget = postflopMinRaiseToLevelChips(lv, f);
      const bbUnitPost = resolveHandBlinds(s).bb;
      if (
        !isVoluntaryBetMultiple(target, bbUnitPost) ||
        target > cap ||
        target < minTarget
      ) {
        return state;
      }
      const add = target - s.betting.contributed[p]!;
      if (add > s.chips[p]!) return state;
      s.chips[p]! -= add;
      s.pot += add;
      s.betting.contributed[p]! = target;
      s.betting.currentLevel = target;
      s.betting.raiseDone = true;
      s.betting.checksThisStreet = 0;
      pushLog(s, { t: "postflop_action", player: p, action: "레이즈", amount: target });
      s.toAct = other(p);
      return done(s);
    }

    case "USE_IA": {
      if (s.phase !== "river" || s.toAct == null) return state;
      const p = s.toAct;
      if (s.iaUsed[p]) return state;
      const cost = iaCostFromPot(s.pot, resolveHandBlinds(s).bb);
      if (cost > s.chips[p]!) return state;
      s.chips[p]! -= cost;
      s.pot -= cost;
      s.iaPotRemovalTotal = roundHalfChip(s.iaPotRemovalTotal + cost);
      s.iaUsed[p] = true;
      const opp = other(p);
      s.iaReveal[p] = s.holes[opp]!.iaCategory;
      pushLog(s, { t: "ia", player: p, revealedCategory: s.holes[opp]!.iaCategory, cost });
      s.lastActionNote = `IA 완료`;
      return done(s);
    }

    case "NEW_HAND": {
      if (s.matchWinner != null) return state;
      if (!(s.phase === "showdown" || s.phase === "hand_over")) return state;
      const c0n = s.chips[0]!;
      const c1n = s.chips[1]!;
      if (c0n <= 1e-9 || c1n <= 1e-9) {
        if (c0n <= 1e-9 && c1n <= 1e-9) {
          s.matchWinner = c0n >= c1n ? 0 : 1;
          pushLog(s, { t: "player_busted", player: 0 });
          pushLog(s, { t: "player_busted", player: 1 });
        } else if (c0n <= 1e-9) {
          s.matchWinner = 1;
          pushLog(s, { t: "player_busted", player: 0 });
        } else {
          s.matchWinner = 0;
          pushLog(s, { t: "player_busted", player: 1 });
        }
        s.isAllIn = false;
        s.potAwardFlash = null;
        return done(s);
      }
      if (s.roundNumber >= TOTAL_ROUNDS) {
        s.matchWinner = s.chips[0]! >= s.chips[1]! ? 0 : 1;
        s.isAllIn = false;
        s.potAwardFlash = null;
        return done(s);
      }
      s.roundNumber += 1;
      s.handBlinds = handBlindsFromRound(s.roundNumber);
      s.button = other(s.button);
      s.phase = "hand_select";
      s.handSelectPhase = "open";
      s.preflopStage = null;
      s.preflopRaiseCount = 0;
      s.holes = [null, null];
      s.handPickPending = [null, null];
      s.board = [];
      s.boardRevealed = 0;
      s.pot = 0;
      s.potAwardFlash = null;
      s.betting = freshBetting();
      s.toAct = null;
      s.winner = null;
      s.handEndMode = null;
      s.iaUsed = [false, false];
      s.iaReveal = [null, null];
      pushLog(s, { t: "round_start", round: s.roundNumber });
      s.lastActionNote = "양쪽 핸드 선택 (동시)";
      s.isAllIn = false;
      return done(s);
    }

    default:
      return state;
  }
}
