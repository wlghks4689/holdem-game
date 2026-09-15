import { MYSTERY_HOLDEM_CONFIG } from "../src/mysteryHoldem/config";
import { CARD_CATEGORY_LABEL, cardCategoryFromLegacy } from "../src/mysteryHoldem/mysteryCard";
import type { MysteryCardCategory } from "../src/mysteryHoldem/mysteryCard";
import { MISSION_POOL } from "../src/mysteryHoldem/mysteryMissions";
import type { MysteryGameState, Seat } from "../src/mysteryHoldem/types";

/**
 * Mystery Card 카테고리별 측정(§29).
 *
 * 기존 시뮬레이터는 `mission_result` 로그만 세어 "성공률 × 보상"을 냈다. 그 방식으로는
 * 새 카드 체계를 평가할 수 없다.
 *
 *   - **강화형**의 보상은 점수가 아니라 효과 자체다. Four Card를 Mission Point EV 0으로
 *     평가하면 "쓸모없는 카드"라는 잘못된 결론이 나온다. 그래서 카드를 들고 있는 동안의
 *     칩 변화·팟 승률·유지 기간을 따로 잰다.
 *   - **발동형**의 가치도 자기가 얻은 점수가 아니라 "상대에게서 지운 점수"와
 *     "바꿔 놓은 팟의 크기"에 있다.
 *
 * 로그만으로는 이 값들을 알 수 없어서(로그는 결과만 남긴다), 핸드 시작 시점의 카드 보유
 * 상태와 칩을 스냅샷으로 잡아 두고 핸드가 끝난 뒤 차이를 계산한다.
 */

interface CardStat {
  id: string;
  name: string;
  category: MysteryCardCategory;
  /** 이 카드를 들고 플레이한 핸드 수 */
  heldHands: number;
  /** 조건을 달성한 핸드 수 */
  achievedHands: number;
  /** 실제로 지급된 Mission Point 합계(무효화 반영 후) */
  rewardTotal: number;
  /** 이 카드를 들고 있는 동안의 칩 증감 합계 */
  chipDelta: number;
  /** 팟을 하나라도 이긴 핸드 수 */
  potWins: number;
  /** 쇼다운까지 간 핸드 수 */
  showdowns: number;
  /** 쇼다운에서 이긴 핸드 수 */
  showdownWins: number;
  /** 다음 핸드에 카드가 교체된 횟수 */
  replacements: number;
  /** 이 카드가 다른 좌석에서 지운 Mission Point 합계 */
  deniedFromOthers: number;
  /** 이 카드 때문에 승자가 달라진 팟의 칩 합계(Forced Split) */
  potValueChanged: number;
  /**
   * 이 카드를 들고 있는 동안 얻은 Bounty Point 합계.
   *
   * Bounty Hunter는 보상을 Mission Point가 아니라 Bounty Point 배수로 받는다. Mission EV만
   * 보면 0으로 나와 "쓸모없는 카드"로 오독된다 — §29가 경고하는 바로 그 함정이다.
   */
  bountyDelta: number;
}

/** 한 핸드가 시작될 때의 좌석 상태 스냅샷 */
interface HandSnapshot {
  cardId: string | null;
  chips: number;
  bountyPoint: number;
}

function emptyStat(id: string, name: string, category: MysteryCardCategory): CardStat {
  return {
    id,
    name,
    category,
    heldHands: 0,
    achievedHands: 0,
    rewardTotal: 0,
    chipDelta: 0,
    potWins: 0,
    showdowns: 0,
    showdownWins: 0,
    replacements: 0,
    deniedFromOthers: 0,
    potValueChanged: 0,
    bountyDelta: 0,
  };
}

export class CardMetrics {
  private readonly stats = new Map<string, CardStat>();
  private snapshot = new Map<Seat, HandSnapshot>();
  /** 직전 핸드에 각 좌석이 들고 있던 카드 — 교체 여부 판정용 */
  private previousCard = new Map<Seat, string | null>();

  constructor() {
    for (const def of MISSION_POOL) {
      this.stats.set(def.id, emptyStat(def.id, def.name, cardCategoryFromLegacy(def.category)));
    }
  }

  private stat(id: string): CardStat {
    let s = this.stats.get(id);
    if (s == null) {
      // 풀에 없는 id는 있을 수 없지만, 측정 도구가 예외로 죽어 시뮬레이션 전체를 날리지 않게 한다.
      s = emptyStat(id, id, "mission");
      this.stats.set(id, s);
    }
    return s;
  }

  /** 베팅이 시작되기 직전(카드·홀카드 확정 후)에 호출한다 */
  beginHand(state: MysteryGameState): void {
    this.snapshot = new Map();
    for (const p of state.players) {
      if (!p.inHand) continue;
      // 스냅샷 시점(preflop 진입)에는 블라인드와 앤티가 이미 스택에서 빠져 나가 있다.
      // p.chips만 기준으로 삼으면 그 돈이 팟에서 승자에게 돌아올 때 "없던 칩이 생긴" 것처럼
      // 잡혀, 카드별 칩 증감의 총합이 제로섬에서 벗어난다(실측 편차의 정체였다).
      // 이미 낸 몫을 되돌려 "핸드 시작 직전 스택"을 기준값으로 쓴다.
      this.snapshot.set(p.seat, {
        cardId: p.mission?.def.id ?? null,
        chips: p.chips + p.handContribution + p.anteContribution,
        bountyPoint: p.bountyPoint,
      });
    }
  }

  /**
   * 핸드가 끝난 뒤(phase === "hand_over") 호출한다.
   * `logCursor`는 이번 핸드에 추가된 로그의 시작 위치다.
   */
  endHand(state: MysteryGameState, logCursor: number): void {
    // 매치가 끝나는 핸드는 루프 안과 루프 밖에서 두 번 호출된다. 스냅샷을 비워 두 번째
    // 호출을 무해하게 만든다 — 그러지 않으면 매 매치의 마지막(대개 가장 큰) 핸드가
    // 이중 계상되어 칩 증감 합계가 제로섬에서 벗어난다.
    if (this.snapshot.size === 0) return;
    const newLogs = state.logs.slice(logCursor);

    const wonPot = new Set<Seat>();
    const reachedShowdown = new Set<Seat>();
    const showdownWinner = new Set<Seat>();
    let forcedSplitPotValue = 0;
    const forcedSplitSeats = new Set<Seat>();

    for (const log of newLogs) {
      if (log.t === "fold_win") wonPot.add(log.winner);
      if (log.t === "showdown") {
        for (const w of log.winners) {
          wonPot.add(w);
          showdownWinner.add(w);
        }
        if (log.forcedSplit) {
          forcedSplitPotValue += log.potAmount;
          for (const w of log.winners) forcedSplitSeats.add(w);
        }
      }
    }
    // 쇼다운 참가 여부는 로그가 아니라 상태에서 읽는다 — 진 쪽은 로그에 남지 않는다.
    if (newLogs.some((l) => l.t === "showdown")) {
      for (const p of state.players) {
        if (p.inHand && !p.folded) reachedShowdown.add(p.seat);
      }
    }

    // Forced Split이 바꾼 팟 가치는 그 카드 보유자 앞으로 단다(승자가 아니라 원인 제공자다).
    if (forcedSplitPotValue > 0) {
      for (const [, snap] of this.snapshot) {
        if (snap.cardId != null && this.stat(snap.cardId).category === "trigger") {
          const def = MISSION_POOL.find((m) => m.id === snap.cardId);
          if (def?.potRule === "forced_split") {
            this.stat(snap.cardId).potValueChanged += forcedSplitPotValue;
            break; // 같은 팟을 여러 보유자 앞으로 중복 계상하지 않는다
          }
        }
      }
    }

    for (const [seat, snap] of this.snapshot) {
      if (snap.cardId == null) continue;
      const stat = this.stat(snap.cardId);
      const player = state.players.find((p) => p.seat === seat);
      if (player == null) continue;

      stat.heldHands++;
      stat.chipDelta += player.chips - snap.chips;
      stat.bountyDelta += player.bountyPoint - snap.bountyPoint;
      if (wonPot.has(seat)) stat.potWins++;
      if (reachedShowdown.has(seat)) stat.showdowns++;
      if (showdownWinner.has(seat)) stat.showdownWins++;

      const result = newLogs.find((l) => l.t === "mission_result" && l.seat === seat);
      if (result != null && result.t === "mission_result") {
        if (result.achieved) stat.achievedHands++;
        stat.rewardTotal += result.reward;
      }

      // 이 좌석이 다른 좌석의 점수를 지웠는지: 무효화된 좌석의 deniedReward를 지정자 앞으로 단다.
      const myTarget = player.mission?.targetSeat;
      if (myTarget != null) {
        const victim = newLogs.find((l) => l.t === "mission_result" && l.seat === myTarget);
        if (victim != null && victim.t === "mission_result" && victim.deniedReward > 0) {
          stat.deniedFromOthers += victim.deniedReward;
        }
      }

      if (player.mission?.shouldReplace) stat.replacements++;
      this.previousCard.set(seat, snap.cardId);
    }
    this.snapshot = new Map();
  }

  /**
   * 카드별 칩 증감의 총합. 칩은 플레이어 사이를 오갈 뿐 생기거나 사라지지 않으므로
   * 이 값은 0이어야 한다. 0이 아니면 측정 기준점이 틀렸다는 뜻이라, 잘못된 밸런스 결론을
   * 내기 전에 드러나도록 보고서에 함께 찍는다.
   */
  chipDeltaResidual(): number {
    return [...this.stats.values()].reduce((a, r) => a + r.chipDelta, 0);
  }

  rows(): CardStat[] {
    const order: MysteryCardCategory[] = ["mission", "enhancement", "trigger"];
    return [...this.stats.values()]
      .filter((s) => s.heldHands > 0)
      .sort(
        (a, b) =>
          order.indexOf(a.category) - order.indexOf(b.category) ||
          b.heldHands - a.heldHands,
      );
  }

  report(): string {
    const lines: string[] = [];
    const rows = this.rows();
    const divisor = MYSTERY_HOLDEM_CONFIG.chipPointDivisor;
    const pct = (n: number, d: number) => (d === 0 ? "—" : `${((n / d) * 100).toFixed(1)}%`);
    const num = (n: number, digits = 1) => n.toFixed(digits);

    for (const category of ["mission", "enhancement", "trigger"] as const) {
      const group = rows.filter((r) => r.category === category);
      if (group.length === 0) continue;
      lines.push(`\n=== ${CARD_CATEGORY_LABEL[category]} ===`);

      if (category === "mission") {
        // 미션형이라도 Bounty Hunter는 보상을 Bounty Point로 받는다. Mission EV만 찍으면
        // 0으로 보여 오독되므로 Bounty 열을 나란히 둔다(§29).
        lines.push(
          `  ${"Card".padEnd(20)} ${"보유핸드".padStart(8)} ${"성공률".padStart(8)} ${"평균보상".padStart(9)} ${"핸드당EV".padStart(9)} ${"핸드당Bounty".padStart(12)}`,
        );
        for (const r of group) {
          const avgReward = r.achievedHands === 0 ? 0 : r.rewardTotal / r.achievedHands;
          lines.push(
            `  ${r.name.padEnd(20)} ${String(r.heldHands).padStart(8)} ${pct(r.achievedHands, r.heldHands).padStart(8)} ` +
              `${num(avgReward).padStart(9)} ${num(r.rewardTotal / r.heldHands, 2).padStart(9)} ` +
              `${num(r.bountyDelta / r.heldHands, 2).padStart(12)}`,
          );
        }
      } else if (category === "enhancement") {
        // 강화형은 점수가 0에 가깝다. 효과의 값어치는 칩과 승률로만 보인다(§29).
        lines.push(
          `  ${"Card".padEnd(20)} ${"보유핸드".padStart(8)} ${"핸드당칩P".padStart(10)} ${"팟승률".padStart(8)} ${"쇼다운승률".padStart(10)} ${"교체율".padStart(8)} ${"핸드당EV".padStart(9)}`,
        );
        for (const r of group) {
          lines.push(
            `  ${r.name.padEnd(20)} ${String(r.heldHands).padStart(8)} ` +
              `${num(r.chipDelta / r.heldHands / divisor, 2).padStart(10)} ` +
              `${pct(r.potWins, r.heldHands).padStart(8)} ${pct(r.showdownWins, r.showdowns).padStart(10)} ` +
              `${pct(r.replacements, r.heldHands).padStart(8)} ${num(r.rewardTotal / r.heldHands, 2).padStart(9)}`,
          );
        }
        lines.push("  * 핸드당칩P = 카드를 들고 있는 동안의 칩 증감을 Chip Point로 환산한 평균");
        lines.push("  * 평균 유지 기간 = 1 / 교체율 (핸드)");
      } else {
        lines.push(
          `  ${"Card".padEnd(20)} ${"보유핸드".padStart(8)} ${"발동률".padStart(8)} ${"핸드당EV".padStart(9)} ${"지운점수".padStart(9)} ${"바꾼팟".padStart(10)}`,
        );
        for (const r of group) {
          lines.push(
            `  ${r.name.padEnd(20)} ${String(r.heldHands).padStart(8)} ${pct(r.achievedHands, r.heldHands).padStart(8)} ` +
              `${num(r.rewardTotal / r.heldHands, 2).padStart(9)} ${num(r.deniedFromOthers / r.heldHands, 2).padStart(9)} ` +
              `${num(r.potValueChanged / r.heldHands / divisor, 2).padStart(10)}`,
          );
        }
        lines.push("  * 지운점수 = 이 카드가 상대에게서 무효화한 Mission Point (핸드당 평균)");
        lines.push("  * 바꾼팟 = Forced Split으로 승자가 달라진 팟의 크기 (핸드당 평균 Chip Point)");
      }
    }

    // 카테고리 간 비교: 강화형·발동형을 Mission Point EV로만 보면 안 된다는 점을 숫자로 보여준다.
    lines.push("\n=== 카테고리 요약(핸드당 평균) ===");
    lines.push(
      `  ${"분류".padEnd(8)} ${"보유핸드".padStart(8)} ${"MissionEV".padStart(10)} ${"칩P변화".padStart(9)} ${"팟승률".padStart(8)}`,
    );
    for (const category of ["mission", "enhancement", "trigger"] as const) {
      const group = rows.filter((r) => r.category === category);
      if (group.length === 0) continue;
      const held = group.reduce((a, r) => a + r.heldHands, 0);
      const reward = group.reduce((a, r) => a + r.rewardTotal, 0);
      const chips = group.reduce((a, r) => a + r.chipDelta, 0);
      const wins = group.reduce((a, r) => a + r.potWins, 0);
      lines.push(
        `  ${CARD_CATEGORY_LABEL[category].padEnd(8)} ${String(held).padStart(8)} ` +
          `${num(reward / held, 2).padStart(10)} ${num(chips / held / divisor, 2).padStart(9)} ${pct(wins, held).padStart(8)}`,
      );
    }

    // 측정 기준점이 맞는지 보고서가 스스로 증명한다. 칩은 플레이어 사이를 오갈 뿐이므로
    // 이 합계는 0이어야 하고, 0이 아니면 아래 숫자들로 밸런스를 논하면 안 된다.
    const residual = this.chipDeltaResidual();
    const heldTotal = rows.reduce((a, r) => a + r.heldHands, 0);
    lines.push(
      `\n  [자가검증] 칩 증감 총합 ${residual.toFixed(0)} chips (0이어야 정상)` +
        (Math.abs(residual) > heldTotal ? "  ← 측정 기준점 오류" : ""),
    );

    return lines.join("\n");
  }
}
