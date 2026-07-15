import type { Card } from "./cards";

/** IA 공개용 상대 핸드 카테고리 라벨 */
export type OpponentHandCategory =
  | "하이파켓"
  | "Ax 오프수트"
  | "브로드웨이 수딧"
  | "미들파켓"
  | "로우파켓"
  | "커넥터 수딧";

export type Street = "lobby" | "hand_select" | "preflop" | "flop" | "turn" | "river" | "showdown" | "hand_over";

export type PlayerIndex = 0 | 1;

export type HoldemGameMode = "classic" | "cost";
export type HandAcquisitionType = "selected" | "mystery" | "forced-random";

export type HandPoolTemplateKind = "pair" | "offsuit" | "suited";

export type HandPoolTemplate = {
  /** 고유 ID (풀 잔량 맵 키) */
  id: string;
  iaCategory: OpponentHandCategory;
  kind: HandPoolTemplateKind;
  /** 두 카드 랭크 (페어는 동일) — 숫자 2~14 (A=14) */
  ranks: [number, number];
  maxUses: number;
  cost: number;
};

export type SelectedHand = {
  templateId: string | null;
  hole: [Card, Card];
  iaCategory: OpponentHandCategory;
  acquisitionType: HandAcquisitionType;
  selectedHandKey: string | null;
};

/** 핸드 풀 선택 제출(확정 전). 문양은 `resolvePendingHandPicks`에서 균등 무작위 배정 */
export type HandPickPending =
  | { kind: "selected"; templateId: string }
  | { kind: "mystery" }
  | { kind: "forced-random" };

export type BettingRoundMeta = {
  /**
   * 이번 스트리트 기여(프리플랍: 블라인드·자발 베팅만; BB 앤티는 `contributed`에 넣지 않음).
   * 포스트플랍: 해당 스트리트에서 넣은 칩.
   */
  contributed: [number, number];
  /** 현재 베팅 레벨 (스트리트 기준 상대 최대 기여액) */
  currentLevel: number;
  /** 레거시 플래그 — 베팅 연산에만 사용(포스트플랍 다중 레이즈 허용 시 사실상 항상 false에 가깝게 유지) */
  raiseDone: boolean;
  /** 포스트플랍: 체크 연속 (둘 다 체크 시 스트리트 종료) */
  checksThisStreet: number;
  /**
   * 이번 스트리트에서 이미 나온 레이즈 횟수(프리플랍·포스트플랍 공통).
   * 오픈 레이즈(PREFLOP_RAISE, 포스트의 POSTFLOP_RAISE만 — 베트는 제외) 및
   * 레이즈 성격의 프리 올인(PREFLOP_ALL_IN)마다 +1. `MAX_RAISES_PER_STREET` 도달 후 추가 레이즈 불가.
   */
  raisesThisStreet: number;
};

/** 프리플랍 서브단계 — 헤즈업 블라인드 포스팅 후 */
export type PreflopStage = "button_acts" | "bb_option" | "facing_raise";

/** 이번 핸드에 고정된 스몰/빅/앤티(칩). 핸드 시작(라운드 확정) 시 설정, 진행 중 불변 */
export type HandBlinds = {
  sb: number;
  bb: number;
  ante: number;
};

export type GameMessage =
  | { t: "round_start"; round: number }
  | { t: "hand_pick_conflict" }
  | { t: "hand_chosen"; player: PlayerIndex; label: string }
  | { t: "preflop_action"; player: PlayerIndex; action: string; amount?: number }
  | { t: "street_cards"; street: Street; cards: Card[]; pot: number }
  | { t: "postflop_action"; player: PlayerIndex; action: string; amount?: number }
  | {
      t: "ia";
      player: PlayerIndex;
      revealedCategory?: OpponentHandCategory;
      acquisitionType: HandAcquisitionType;
      cost: number;
    }
  | {
      t: "showdown";
      winners: PlayerIndex[];
      pot: number;
      desc: string;
      /** 카드 쇼다운 시 좌석별 족보 요약(0·1). 없으면 구버전 로그 */
      hands?: [string, string];
      /** 폴드로 끝난 경우 폴드한 좌석 */
      folder?: PlayerIndex;
    }
  | { t: "player_busted"; player: PlayerIndex };

export type GameState = {
  gameMode: HoldemGameMode;
  phase: Street;
  roundNumber: number;
  handBlinds: HandBlinds;
  /**
   * 이번 핸드의 딜러 버튼(헤즈업에서 스몰 블라인드) 좌석.
   * `NEW_HAND`마다 교대 — 특정 좌석에 고정되지 않습니다.
   */
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
  /** Hand-purchase resource, separate from chips/BB/IA costs. Does not regenerate during a match. */
  handCostRemaining: [number, number];
  mysteryHandUsed: [boolean, boolean];
  /** null 이면 아직 미선택 */
  holes: [SelectedHand | null, SelectedHand | null];
  /** 양쪽 제출 전까지 비공개. 확정 후 null */
  handPickPending: [HandPickPending | null, HandPickPending | null];
  board: Card[];
  /** 3장 이후 턴/리버는 단계적으로 공개 — 인덱스 0..4 */
  boardRevealed: number;
  /**
   * 올인 런아웃 직전 공개 장 수 — UI 단계 연출용. 런아웃이 아니면 null.
   */
  runoutUiStartRevealed: number | null;
  betting: BettingRoundMeta;
  /** 턴을 끝낼 플레이어 (액션해야 하는 사람) */
  toAct: PlayerIndex | null;
  /** 프리플랍: 버튼이 아직 선택 안 함 */
  /** 핸드 선택: `open`이면 양쪽이 동시에 고르고 각각 확정 가능 */
  handSelectPhase: "open" | "done";
  preflopStage: PreflopStage | null;
  /** 프리플랍 레이즈(및 프리 올인) 횟수 — UI 힌트 등(팟 캡·최소 레이즈로 실제 제한) */
  preflopRaiseCount: number;
  /** 리버에서 IA 사용 여부 (플레이어별) */
  iaUsed: [boolean, boolean];
  /**
   * 매치 동안 IA로 팟에서 제거된 칩 누적(로그 tail 잘림과 무관).
   * 경제식: chips[0]+chips[1]+pot+iaPotRemovalTotal === 2*STARTING_CHIPS(일반 400).
   * 구버전 저장본에는 없을 수 있음 → UI는 로그 합으로 보조.
   */
  iaPotRemovalTotal: number;
  /** 상대 카테고리 공개 (IA 성공 시) */
  iaReveal: [OpponentHandCategory | null, OpponentHandCategory | null];
  iaRevealType: [HandAcquisitionType | null, HandAcquisitionType | null];
  winner: PlayerIndex | null;
  /** 마지막 판 종료 방식 — 폴드 시 상대 홀 비공개 유지 */
  handEndMode: null | "showdown" | "fold";
  /** 전체 승자 (30라운드 후 또는 버스트) */
  matchWinner: PlayerIndex | null;
  matchEnded: boolean;
  logs: GameMessage[];
  /** 마지막 액션 설명 (UI) */
  lastActionNote: string;
  /** 이번 핸드에서 한 명 이상 스택 0 — 올인 런아웃·UI 표시용 */
  isAllIn: boolean;
  /**
   * 게임 시작 시 하이카드 드로우 결과 — 로비 입장 후 첫 핸드 시작 직전에만 설정.
   * ranks[0] = 시트 0 드로우 랭크, ranks[1] = 시트 1 드로우 랭크 (2~14).
   * UI 연출 전용. NEW_HAND에서 제거하지 않음(연출 중 유지용).
   */
  highCardDraw: { ranks: [number, number]; winnerSeat: PlayerIndex } | null;
};

export type GameAction =
  | {
      type: "SELECT_HAND";
      player: PlayerIndex;
      templateId: string;
    }
  | { type: "SELECT_MYSTERY_HAND"; player: PlayerIndex }
  | { type: "SELECT_FORCED_RANDOM"; player: PlayerIndex }
  | { type: "PREFLOP_CALL" }
  /** BB 옵션: 버튼이 콜만 했을 때 추가 칩 없이 통과 */
  | { type: "PREFLOP_CHECK" }
  | { type: "PREFLOP_RAISE"; toLevelChips: number }
  /** 15bb 이하 스택: 프리플랍 전액 레이즈(일반 최소·상한·BB배수 규칙 면제, 팟 캡은 유지) */
  | { type: "PREFLOP_ALL_IN" }
  | { type: "POSTFLOP_CHECK" }
  | { type: "POSTFLOP_BET"; amount: number }
  | { type: "POSTFLOP_CALL" }
  | { type: "POSTFLOP_RAISE"; toLevelChips: number }
  | { type: "FOLD" }
  | { type: "USE_IA" }
  | { type: "NEW_HAND" }
  /** 매치 종료 후 같은 방/세션에서 재경기 시작(초기화 + 코인토스) */
  | { type: "RESET_MATCH"; initialChips?: [number, number] }
  /** 멀티플레이 로비: 호스트(시트 0)가 누르는 게임 시작. 하이카드 드로우 후 hand_select로 전환 */
  | { type: "START_GAME" };
