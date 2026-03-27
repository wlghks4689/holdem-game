import type { Card } from "./cards";

/** IA 공개용 상대 핸드 카테고리 라벨 */
export type OpponentHandCategory =
  | "하이파켓"
  | "Ax 오프수트"
  | "브로드웨이 수딧"
  | "미들파켓"
  | "로우파켓"
  | "커넥터 수딧";

export type Street = "hand_select" | "preflop" | "flop" | "turn" | "river" | "showdown" | "hand_over";

export type PlayerIndex = 0 | 1;

export type HandPoolTemplateKind = "pair" | "offsuit" | "suited";

export type HandPoolTemplate = {
  /** 고유 ID (풀 잔량 맵 키) */
  id: string;
  iaCategory: OpponentHandCategory;
  kind: HandPoolTemplateKind;
  /** 두 카드 랭크 (페어는 동일) — 숫자 2~14 (A=14) */
  ranks: [number, number];
  maxUses: number;
};

export type SelectedHand = {
  templateId: string;
  hole: [Card, Card];
  iaCategory: OpponentHandCategory;
};

/** 핸드 풀 선택 제출(확정 전). 문양은 `resolvePendingHandPicks`에서 균등 무작위 배정 */
export type HandPickPending = {
  templateId: string;
};

export type BettingRoundMeta = {
  /**
   * 이번 스트리트 기여(프리플랍: 블라인드·자발 베팅만; BB 앤티는 `contributed`에 넣지 않음).
   * 포스트플랍: 해당 스트리트에서 넣은 칩.
   */
  contributed: [number, number];
  /** 현재 베팅 레벨 (스트리트 기준 상대 최대 기여액) */
  currentLevel: number;
  /** 이 스트리트에서 벌써 리레이즈가 있었는지 (3-bet 금지) */
  raiseDone: boolean;
  /** 포스트플랍: 체크 연속 (둘 다 체크 시 스트리트 종료) */
  checksThisStreet: number;
};

/** 프리플랍 서브단계 — 헤즈업 블라인드 포스팅 후 */
export type PreflopStage = "button_acts" | "bb_option" | "facing_raise";

export type GameMessage =
  | { t: "round_start"; round: number }
  | { t: "hand_pick_conflict" }
  | { t: "hand_chosen"; player: PlayerIndex; label: string }
  | { t: "preflop_action"; player: PlayerIndex; action: string; amount?: number }
  | { t: "street_cards"; street: Street; cards: Card[]; pot: number }
  | { t: "postflop_action"; player: PlayerIndex; action: string; amount?: number }
  | { t: "ia"; player: PlayerIndex; revealedCategory: OpponentHandCategory; cost: number }
  | { t: "showdown"; winners: PlayerIndex[]; pot: number; desc: string }
  | { t: "player_busted"; player: PlayerIndex };

export type GameState = {
  phase: Street;
  roundNumber: number;
  /** 0 = 버튼/SB, 1 = BB (토글 매 라운드) */
  button: PlayerIndex;
  chips: [number, number];
  pot: number;
  /**
   * 직전 핸드 팟 정산 플래시(칩): 양수 = 이번에 팟에서 얻은 양, 음수 = 상대가 가져간 팟(2인·표시용).
   * 무승부는 둘 다 양수(각자 분배액). NEW_HAND에서 제거.
   */
  potAwardFlash: [number, number] | null;
  /** 플레이어별 독립: 각 템플릿 남은 사용 횟수 (매치 동안만, NEW_HAND에서 리셋 없음) */
  handPoolRemaining: [Record<string, number>, Record<string, number>];
  /** null 이면 아직 미선택 */
  holes: [SelectedHand | null, SelectedHand | null];
  /** 양쪽 제출 전까지 비공개. 확정 후 null */
  handPickPending: [HandPickPending | null, HandPickPending | null];
  board: Card[];
  /** 3장 이후 턴/리버는 단계적으로 공개 — 인덱스 0..4 */
  boardRevealed: number;
  betting: BettingRoundMeta;
  /** 턴을 끝낼 플레이어 (액션해야 하는 사람) */
  toAct: PlayerIndex | null;
  /** 프리플랍: 버튼이 아직 선택 안 함 */
  handSelectPhase: "button" | "bb" | "done";
  preflopStage: PreflopStage | null;
  /** 프리플랍 레이즈 횟수 (3-bet 금지: 2 도달 후 추가 레이즈 불가) */
  preflopRaiseCount: number;
  /** 리버에서 IA 사용 여부 (플레이어별) */
  iaUsed: [boolean, boolean];
  /** 상대 카테고리 공개 (IA 성공 시) */
  iaReveal: [OpponentHandCategory | null, OpponentHandCategory | null];
  winner: PlayerIndex | null;
  /** 마지막 판 종료 방식 — 폴드 시 상대 홀 비공개 유지 */
  handEndMode: null | "showdown" | "fold";
  /** 전체 승자 (30라운드 후 또는 버스트) */
  matchWinner: PlayerIndex | null;
  logs: GameMessage[];
  /** 마지막 액션 설명 (UI) */
  lastActionNote: string;
  /** 이번 핸드에서 한 명 이상 스택 0 — 올인 런아웃·UI 표시용 */
  isAllIn: boolean;
};

export type GameAction =
  | {
      type: "SELECT_HAND";
      player: PlayerIndex;
      templateId: string;
    }
  | { type: "PREFLOP_CALL" }
  /** BB 옵션: 버튼이 콜만 했을 때 추가 칩 없이 통과 */
  | { type: "PREFLOP_CHECK" }
  | { type: "PREFLOP_RAISE"; toLevelChips: number }
  | { type: "POSTFLOP_CHECK" }
  | { type: "POSTFLOP_BET"; amount: number }
  | { type: "POSTFLOP_CALL" }
  | { type: "POSTFLOP_RAISE"; toLevelChips: number }
  | { type: "FOLD" }
  | { type: "USE_IA" }
  | { type: "NEW_HAND" };
