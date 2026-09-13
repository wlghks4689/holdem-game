import type { Card } from "@/holdem/cards";
import type { HandValue } from "@/holdem/pokerEval";

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

export type MissionCategory =
  | "made"
  | "pair"
  | "counter"
  | "extraHand"
  | "underdog"
  | "position";

/** Mission 조건 판정에 필요한 한 핸드 종료 시점의 상황 정보 */
export interface MissionEvalContext {
  seat: Seat;
  round: number;
  buttonSeat: Seat;
  position: PositionLabel;
  board: Card[];
  folded: boolean;
  wentToShowdown: boolean;
  wonAnyPot: boolean;
  wonPotAmount: number;
  bestHandValue: HandValue | null;
  /** 이번 핸드에서 실제로 쇼다운을 겨룬 상대 좌석 */
  showdownOpponents: Seat[];
  opponentBestHandValues: Partial<Record<Seat, HandValue>>;
  /** Underdog 판정용 — 이 플레이어의 최종 홀카드 프리플랍 랭크 점수 */
  myPreflopScore: number;
  opponentPreflopScores: Partial<Record<Seat, number>>;
  /** 이번 핸드에서 Mission을 달성한 상대 좌석 목록 (Counter 계열용, 1차 패스 결과) */
  opponentsAchievedThisHand: Seat[];
  extraHandActive: boolean;
}

/** Mission의 특수 규칙 훅 id (본문 규칙 자체를 변경) — specialRules.ts 참고 */
export type SpecialRuleId = "extra_hand_four_card";

export interface MysteryMissionDef {
  id: string;
  name: string;
  category: MissionCategory;
  description: string;
  /** 조건이 언제 평가되는지에 대한 설명(문서 목적, 로직은 missionResolver가 일괄 처리) */
  trigger: string;
  /** 순수 판정 함수 — true면 이번 핸드에서 조건 달성 */
  condition: (ctx: MissionEvalContext) => boolean;
  /** 성공 시 지급되는 기본 Mission Point (Chips 아님). 잠정값 — 밸런스 확정 전. */
  reward: number;
  /**
   * Made 계열: "이 족보 이상이면 달성"의 기준 족보(HAND_RANK).
   * 값이 있으면 실제 달성한 족보에 따라 보상에 높은 족보 계수가 곱해진다
   * (missionRewards.ts). 데이터로 선언하므로 Mission을 추가해도 resolver 수정이 필요 없다.
   */
  madeHandThreshold?: number;
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
  /** 이번 배정 사이클에서 이미 조건을 달성해 교체 대기 중인지 */
  achieved: boolean;
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
  /** 이번 핸드 전체 기여 칩 */
  handContribution: number;
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
    }
  | {
      t: "mission_result";
      seat: Seat;
      missionId: string;
      achieved: boolean;
      reward: number;
      /** Counter 계열에 의해 무효화되어 잃은 점수(없으면 0) */
      deniedReward: number;
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
  | { type: "CHECK"; seat: Seat }
  | { type: "CALL"; seat: Seat }
  | { type: "BET"; seat: Seat; amount: number }
  | { type: "RAISE"; seat: Seat; toAmount: number }
  | { type: "ALL_IN"; seat: Seat }
  | { type: "FOLD"; seat: Seat }
  | { type: "START_NEXT_HAND" };
