import type { Card } from "@/holdem/cards";
import type { HandValue } from "@/holdem/pokerEval";
import type { CardPotRule, CardReplacementRule, CardTargetRule } from "./mysteryCard";

/**
 * MysteryHoldem은 기존 헤즈업 전용 `PlayerIndex`(0|1)를 사용하지 않는다.
 * 좌석은 0..seatCount-1 범위의 정수이며, 게임 내내 좌석 배열 길이는 고정된다
 * (버스트되어도 배열에서 제거하지 않고 `busted: true`로 표시해 기록·정산에 사용).
 */
export type Seat = number;

export type MysteryStreet =
  | "lobby"
  | "hand_setup"
  | "preflop"
  | "flop"
  | "turn"
  | "river"
  | "showdown"
  | "hand_over"
  | "match_over";

/** 라운드(=핸드) 종료 없이 자동으로 다음 스트리트까지 진행되는 올인 런아웃 표시용 */
export type RunoutInfo = { active: boolean; startedAtStreet: MysteryStreet } | null;

/**
 * 카드 분류. `mission`/`enhancement`/`trigger`가 새 Mystery Card 어휘이고,
 * 나머지는 아직 새 정의로 교체되지 않은 레거시 Mission의 분류다(단계적으로 사라진다).
 */
export type MissionCategory =
  | "mission"
  | "enhancement"
  | "trigger"
  | "counter"
  | "extraHand";

/** 한 좌석이 획득한 팟 하나 — Underdog처럼 "팟별 참가자"로 판정하는 카드가 쓴다 */
export interface WonPotInfo {
  amount: number;
  /** 이 팟을 실제로 다툰 좌석(팟 자격이 있고 폴드하지 않은 쇼다운 참가자) */
  showdownSeats: Seat[];
}

/** Mission 조건 판정에 필요한 한 핸드 종료 시점의 상황 정보 */
export interface MissionEvalContext {
  seat: Seat;
  round: number;
  buttonSeat: Seat;
  position: PositionLabel;
  board: Card[];
  /** 팟이 끝난 시점까지 실제로 공개된 커뮤니티 카드 수(폴드 승리면 5장 미만일 수 있다) */
  boardRevealed: number;
  /** 매치 시작 인원. 중간에 버스트가 나와도 줄지 않는다(Blind Defender 보상 기준) */
  initialSeatCount: number;
  folded: boolean;
  wentToShowdown: boolean;
  wonAnyPot: boolean;
  wonPotAmount: number;
  /** 이 좌석이 가져간 팟 목록 — 메인/사이드 팟을 개별 판정하는 카드가 쓴다 */
  wonPots: WonPotInfo[];
  /**
   * 이번 핸드의 최종 족보. 쇼다운뿐 아니라 폴드 승리에서도(보드가 한 장이라도 열렸다면)
   * 채워진다 — A High Like a Boss가 폴드 승리도 인정하기 때문이다.
   */
  bestHandValue: HandValue | null;
  /** 이번 핸드에 이 좌석으로 귀속된 기본 Bounty Point(Bounty Hunter 배수 적용 전) */
  bountyShare: number;
  /** 이번 핸드에서 실제로 쇼다운을 겨룬 상대 좌석 */
  showdownOpponents: Seat[];
  opponentBestHandValues: Partial<Record<Seat, HandValue>>;
  /** Underdog 판정용 — 이 플레이어의 최종 홀카드 프리플랍 랭크 점수 */
  myPreflopScore: number;
  opponentPreflopScores: Partial<Record<Seat, number>>;
  /** 이번 핸드에서 카드 조건을 달성한 상대 좌석 목록 (앞선 판정 티어의 결과) */
  opponentsAchievedThisHand: Seat[];
  /**
   * 그중 **미션형** 카드를 달성한 상대만 추린 목록.
   *
   * Mission Breaker와 Parasite는 미션형 카드 결과에만 반응한다(§10, §11) — 강화형/발동형의
   * 효과 자체는 건드리지 않는다. 그래서 "달성한 상대 전원"과 구분해서 들고 다닌다.
   */
  opponentMissionAchievers: Seat[];
  /** 이 카드가 이번 핸드에 지정한 상대 좌석(§22). 지정이 없거나 지정 전이면 null */
  targetSeat: Seat | null;
  /**
   * 팟 판정 훅(Forced Split)이 이번 핸드에 **실제로 결과를 바꿨는가**(§14).
   * 카드를 들고만 있고 승자가 그대로였다면 false다.
   */
  potRuleTriggered: boolean;
  extraHandActive: boolean;
}

/** Mission의 특수 규칙 훅 id (본문 규칙 자체를 변경) — specialRules.ts 참고 */
export type SpecialRuleId = "extra_hand_four_card";

export interface MysteryMissionDef {
  id: string;
  name: string;
  category: MissionCategory;
  description: string;
  /**
   * 카드 선택 화면에 먼저 보여 줄 2~3줄 요약(§23).
   *
   * description은 예외와 단서까지 담아야 해서 선택 순간에 읽기엔 길다. 3장을 나란히 놓고
   * 비교하는 화면에서는 "무엇을 하면 되는가"만 보이면 충분하고, 세부 규칙은 툴팁으로 민다.
   * 선언하지 않으면 description을 그대로 쓴다.
   */
  shortDescription?: string;
  /** 조건이 언제 평가되는지에 대한 설명(문서 목적, 로직은 missionResolver가 일괄 처리) */
  trigger: string;
  /** 순수 판정 함수 — true면 이번 핸드에서 조건 달성 */
  condition: (ctx: MissionEvalContext) => boolean;
  /**
   * 성공 시 지급되는 Mission Point (Chips 아님). 달성 내용에 따라 금액이 달라지는
   * 카드(High-End Maker, Blind Defender)는 `rewardFor`로 계산하고 이 값은 대표값으로 둔다.
   */
  reward: number;
  /** 고정 보상이 아닌 카드의 실제 지급액. 없으면 `reward`를 그대로 쓴다. */
  rewardFor?: (ctx: MissionEvalContext) => number;
  /**
   * 상대의 달성 결과에 의존하는 카드(Mission Breaker / Parasite).
   * true면 자기 완결형 카드들을 먼저 판정한 뒤 나중 티어에서 평가한다(§21 Step A/C).
   */
  dependsOnOpponents?: boolean;
  /**
   * 판정 티어(§21). 낮은 티어가 먼저 확정되고, 각 티어는 **자기보다 낮은 티어의 결과만** 본다.
   *
   *   0 = 자기 결과만 보는 카드(미션형 대부분)
   *   1 = 상대의 미션 달성에 반응하는 카드(Parasite)
   *   2 = 그 반응까지 포함해 무효화하는 카드(Mission Breaker)
   *
   * §11 예시(A=Breaker→B, B=Parasite→C, C=Straight Maker)가 성립하려면 Breaker가
   * Parasite보다 뒤에 판정되어야 한다. 티어를 명시하지 않으면 dependsOnOpponents 여부로 0/1.
   */
  resolutionTier?: number;
  /** 상대 지정 규칙(§22). 선언하면 플랍에서 자신의 첫 액션 전에 대상을 골라야 한다. */
  targetRule?: CardTargetRule;
  /**
   * 팟 승자 판정 단계 자체를 바꾸는 카드(§14, §30).
   *
   * 조건/보상 훅으로는 표현할 수 없다 — 이건 "누가 이겼는가"를 다시 정의하는 규칙이라
   * showdown.ts의 팟 판정이 직접 읽는다. 그래서 별도 Hook id로 선언한다.
   */
  potRule?: CardPotRule;
  /** 카드 교체 조건(§3). 선언이 없으면 "성공 시 교체"로 본다. */
  replacementRule?: CardReplacementRule;
  /**
   * 이 카드가 Bounty Point에 적용하는 배수(Bounty Hunter = 3).
   * Mission Point가 아니라 Bounty Point 쪽을 바꾸므로 reducer의 Bounty 단계에서 쓴다.
   */
  bountyMultiplier?: number;
  /** Counter 계열 등 부가 효과(상대 Mission 무효화 등)를 위한 훅 */
  onAchieved?: (ctx: MissionEvalContext, api: MissionEffectApi) => void;
  specialRule?: SpecialRuleId;
}

/** missionResolver가 onAchieved 훅에 제공하는 부수효과 API (직접 상태를 만지지 않고 요청만 기록) */
export interface MissionEffectApi {
  /** 대상 좌석의 이번 핸드 Mission 보상을 무효화 요청 */
  nullifyReward: (targetSeat: Seat) => void;
  /** 무효화한 보상만큼(또는 지정량) 자신에게 추가 지급 요청 */
  grantBonus: (amount: number) => void;
  /** 대상 좌석의 현재(1차 판정 기준) Mission Point 보상액 조회 — 가로채기 계산용 */
  rewardOf: (seat: Seat) => number;
}

export interface PlayerMissionState {
  def: MysteryMissionDef;
  assignedRound: number;
  /** 이번 배정 사이클에서 조건을 달성했는지 */
  achieved: boolean;
  /**
   * 다음 핸드에 카드를 교체해야 하는지(§3, §20 Phase 6).
   *
   * 예전에는 "성공했으면 교체"라는 전역 규칙이라 achieved 하나로 충분했지만, 이제 카드마다
   * 교체 조건이 다르다(강화형은 팟 승리 시, 발동형은 실제 발동 시). 그래서 "성공했는가"와
   * "교체 대상인가"를 분리한다 — 예: Four Card는 성공 없이 팟만 이겨도 교체된다.
   */
  shouldReplace: boolean;
  /**
   * 이번 핸드에 지정한 상대 좌석(§22). 지정이 필요 없는 카드이거나 아직 고르기 전이면 null.
   * 본인에게만 보이고, 핸드가 끝난 뒤 결과 로그에서 공개된다.
   */
  targetSeat: Seat | null;
}

export type PositionLabel =
  | "BTN"
  | "SB"
  | "BB"
  | "UTG"
  | "MP"
  | "HJ"
  | "CO";

export interface PlayerState {
  seat: Seat;
  name: string;
  chips: number;
  /** hand_setup 단계에서 받은 3장(선택 전). 선택 완료 후 비움 */
  pendingDeal: Card[];
  /** 이번 핸드에서 버린 카드(재사용 방지 추적용) */
  discarded: Card[];
  /** 확정된 홀카드. 일반 2장, Extra Hand Mission 활성 시 4장 */
  holeCards: Card[];
  /** 이번 핸드 참여 여부(§6 "현재 게임 참여 여부") — 버스트되면 이후 핸드에서 항상 false */
  inHand: boolean;
  folded: boolean;
  allIn: boolean;
  busted: boolean;
  /** 이번 스트리트 기여 칩 */
  streetContribution: number;
  /**
   * 이번 핸드 전체 기여 칩. Big Blind Ante는 포함하지 않는다.
   *
   * 앤티까지 여기에 넣으면 BB만 기여액이 한 단계 높아져 "BB만 자격이 있는 사이드 팟"이
   * 매 핸드 생긴다 — 즉 BB가 자기 앤티를 그대로 되돌려받는다. 앤티는 특정 좌석의 몫이
   * 아니라 테이블 공용 데드머니이므로 anteContribution으로 분리한다.
   */
  handContribution: number;
  /** 이번 핸드에 낸 Big Blind Ante — 팟 계층을 만들지 않고 메인 팟에 그대로 얹힌다 */
  anteContribution: number;
  mission: PlayerMissionState | null;
  missionPoint: number;
  bountyPoint: number;
  /** 마지막으로 확정된 chipPoint/totalPoint 캐시 — 매치 종료 시 scoring.ts가 채움 */
  chipPoint: number;
  totalPoint: number;
}

export interface BettingState {
  street: MysteryStreet;
  /** 이번 스트리트 레이즈 캡(최초 베트는 포함되지 않음) */
  raiseCap: number;
  raisesUsed: number;
  /** 이번 스트리트 현재 베팅 레벨(최대 기여액) */
  currentLevel: number;
  /** 다음 레이즈의 최소 증가폭(직전 레이즈 폭 또는 오픈 베팅 시 BB) */
  minRaiseIncrement: number;
  lastAggressorSeat: Seat | null;
  /** 아직 액션해야 하는 좌석 큐(베팅/레이즈 발생 시 초기화) */
  pendingActors: Seat[];
  /**
   * 불완전 올인(풀 레이즈 폭에 못 미치는 올인) 이후, 이미 행동을 마쳐 재레이즈할 수 없는 좌석.
   * 추가된 금액을 콜하거나 폴드할 수는 있지만 레이즈는 못 한다. 풀 레이즈가 나오면 비워진다.
   */
  raiseLockedSeats: Seat[];
}

export type MysteryGameMessage =
  | { t: "match_start"; seatCount: number }
  | { t: "round_start"; round: number; buttonSeat: Seat }
  | { t: "blinds_posted"; sb: Seat; bb: Seat; sbAmount: number; bbAmount: number; anteAmount: number }
  | { t: "hole_selected"; seat: Seat }
  | { t: "mission_offered"; seat: Seat; candidateIds: string[] }
  | { t: "mission_selected"; seat: Seat; missionId: string }
  | { t: "action"; seat: Seat; action: string; amount?: number; street: MysteryStreet }
  | { t: "street_cards"; street: MysteryStreet; cards: Card[]; pot: number }
  | { t: "fold_win"; winner: Seat; pot: number }
  | {
      t: "showdown";
      potIndex: number;
      potAmount: number;
      winners: Seat[];
      desc: string;
      /** 이 팟의 승자가 Forced Split 때문에 달라졌는가(§14) */
      forcedSplit: boolean;
    }
  | {
      t: "mission_result";
      seat: Seat;
      missionId: string;
      achieved: boolean;
      reward: number;
      /** Counter 계열에 의해 무효화되어 잃은 점수(없으면 0) */
      deniedReward: number;
      /** 지정형 카드가 고른 대상 — 핸드가 끝났으므로 이제 공개해도 된다(§22) */
      targetSeat?: Seat;
    }
  | { t: "bounty_awarded"; seat: Seat; bustedSeat: Seat; reward: number }
  | { t: "player_busted"; seat: Seat }
  | { t: "match_over"; reason: "round_limit" | "last_player_standing"; winners: Seat[] };

export interface Pot {
  amount: number;
  eligibleSeats: Seat[];
}

export interface MysteryHoldemConfig {
  startingChips: number;
  smallBlind: number;
  bigBlind: number;
  bigBlindAnte: number;
  totalRounds: number;
  missionChangeRounds: number[];
  raiseCap: Record<"preflop" | "flop" | "turn" | "river", number>;
  /** 베트/레이즈 금액의 최소 단위 — 358, 512 같은 어중간한 금액이 나오지 않게 한다 */
  betStepUnit: number;
  chipPointDivisor: number;
  /** 총 플레이어 수 → 버스트 1건당 Bounty Point (인원이 적을수록 높다) */
  bountyRewardBySeatCount: Record<number, number>;
  maxSeats: number;
  minSeats: number;
}

export interface MysteryGameState {
  config: MysteryHoldemConfig;
  phase: MysteryStreet;
  round: number;
  seatCount: number;
  buttonSeat: Seat;
  players: PlayerState[];
  board: Card[];
  boardRevealed: number;
  /** 이번 핸드에서 이미 사용된(딜된) 모든 카드 — 중복 방지용 순차 딜링 추적 */
  usedCards: Card[];
  pots: Pot[];
  betting: BettingState;
  toActSeat: Seat | null;
  /** hand_setup: 카드 선택을 아직 완료하지 않은 좌석 */
  awaitingHoleSelection: Seat[];
  /** hand_setup: Mission 후보를 아직 선택하지 않은 좌석 */
  awaitingMissionSelection: Seat[];
  missionOffers: Partial<Record<Seat, MysteryMissionDef[]>>;
  /**
   * 플랍에서 상대를 지정해야 하는 좌석(§22). 지정을 마치기 전에는 그 좌석의 베팅 액션이
   * 거부된다 — "자신의 첫 액션 전에" 고른다는 규칙을 상태로 강제한다.
   */
  awaitingCardTarget: Seat[];
  runout: RunoutInfo;
  logs: MysteryGameMessage[];
  lastActionNote: string;
  matchEnded: boolean;
  matchEndReason: "round_limit" | "last_player_standing" | null;
  matchWinners: Seat[] | null;
}

export type MysteryGameAction =
  | { type: "START_MATCH"; seatCount: number; names?: string[] }
  | { type: "SELECT_HOLE_CARDS"; seat: Seat; keepIndexes: [number, number] }
  | { type: "SELECT_MISSION"; seat: Seat; missionId: string }
  | { type: "SELECT_CARD_TARGET"; seat: Seat; targetSeat: Seat }
  | { type: "CHECK"; seat: Seat }
  | { type: "CALL"; seat: Seat }
  | { type: "BET"; seat: Seat; amount: number }
  | { type: "RAISE"; seat: Seat; toAmount: number }
  | { type: "ALL_IN"; seat: Seat }
  | { type: "FOLD"; seat: Seat }
  | { type: "START_NEXT_HAND" };
