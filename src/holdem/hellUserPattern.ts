/**
 * Hell: 최근 핸드에서 유저(휴먼) 패턴 추적 → AI가 “읽는” 듯한 보정.
 */
import type { GameAction, GameState, PlayerIndex } from "./types";

const MAX_HANDS = 10;
const MIN_SAMPLES = 2;

export type HellUserHandRecord = {
  humanRaisedPreflop: boolean;
  humanUsedIA: boolean;
  humanFolded: boolean;
  reachedShowdown: boolean;
};

export type HellAdaptation = {
  /** 블러프·랜덤 공격 가중에 곱함 */
  bluffMult: number;
  /** 콜 임계값에 곱함 (클수록 더 콜) */
  callMult: number;
  /** 레이즈/베트 공격성 */
  raiseMult: number;
};

const NEUTRAL: HellAdaptation = {
  bluffMult: 1,
  callMult: 1,
  raiseMult: 1,
};

export class HellUserPatternTracker {
  private readonly history: HellUserHandRecord[] = [];
  private cur: {
    humanRaisedPreflop: boolean;
    humanUsedIA: boolean;
    humanFolded: boolean;
  } = {
    humanRaisedPreflop: false,
    humanUsedIA: false,
    humanFolded: false,
  };

  resetHand(): void {
    this.cur = {
      humanRaisedPreflop: false,
      humanUsedIA: false,
      humanFolded: false,
    };
  }

  onHumanAction(humanSeat: PlayerIndex, action: GameAction): void {
    switch (action.type) {
      case "PREFLOP_RAISE":
      case "PREFLOP_ALL_IN":
        this.cur.humanRaisedPreflop = true;
        break;
      case "USE_IA":
        this.cur.humanUsedIA = true;
        break;
      case "FOLD":
        this.cur.humanFolded = true;
        break;
      default:
        break;
    }
  }

  finalizeHand(state: GameState, humanSeat: PlayerIndex): void {
    const showdown =
      state.handEndMode === "showdown" && !this.cur.humanFolded;
    const rec: HellUserHandRecord = {
      humanRaisedPreflop: this.cur.humanRaisedPreflop,
      humanUsedIA: this.cur.humanUsedIA,
      humanFolded: this.cur.humanFolded,
      reachedShowdown: showdown,
    };
    this.history.push(rec);
    while (this.history.length > MAX_HANDS) this.history.shift();
    this.resetHand();
  }

  getAdaptation(): HellAdaptation {
    const n = this.history.length;
    if (n < MIN_SAMPLES) return NEUTRAL;

    let sumRaise = 0;
    let sumIa = 0;
    let sumFold = 0;
    let sumSd = 0;
    for (const h of this.history) {
      sumRaise += h.humanRaisedPreflop ? 1 : 0;
      sumIa += h.humanUsedIA ? 1 : 0;
      sumFold += h.humanFolded ? 1 : 0;
      sumSd += h.reachedShowdown ? 1 : 0;
    }
    const raiseRate = sumRaise / n;
    const iaRate = sumIa / n;
    const foldRate = sumFold / n;
    const sdRate = sumSd / n;

    let bluffMult = 1;
    let callMult = 1;
    let raiseMult = 1;

    /* 공격적 오픈 — 상대 레인지 좁음 → 콜·캐치업, 블러프 감소 */
    if (raiseRate > 0.42) {
      callMult += 0.1;
      bluffMult -= 0.12;
      raiseMult -= 0.06;
    } else if (raiseRate < 0.18) {
      bluffMult += 0.14;
      raiseMult += 0.1;
    }

    /* 폴드 많음 — 스틸·블러프 */
    if (foldRate > 0.48) {
      bluffMult += 0.12;
      raiseMult += 0.08;
    } else if (foldRate < 0.22) {
      bluffMult -= 0.14;
      callMult += 0.08;
    }

    /* 쇼다운 많음 — 밸류 위주 */
    if (sdRate > 0.55) {
      bluffMult -= 0.12;
      callMult += 0.06;
    }

    /* IA 자주 씀 — 정보 비용 큼, 밸류·히어로 콜 조정 */
    if (iaRate > 0.38) {
      bluffMult -= 0.08;
      callMult -= 0.05;
      raiseMult += 0.05;
    } else if (iaRate < 0.08) {
      bluffMult += 0.06;
    }

    const clampM = (x: number) => Math.max(0.68, Math.min(1.32, x));

    return {
      bluffMult: clampM(bluffMult),
      callMult: clampM(callMult),
      raiseMult: clampM(raiseMult),
    };
  }
}
