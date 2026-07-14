import type { Card, Suit } from "./cards";
import type {
  GameState,
  HandPickPending,
  HandPoolTemplate,
  HoldemGameMode,
  OpponentHandCategory,
  PlayerIndex,
  SelectedHand,
} from "./types";

export const SUITS: Suit[] = ["c", "d", "h", "s"];
export const HAND_COST_STARTING_POINTS = 100;

const CAT_HIGH_PAIR = "?섏씠?뚯폆";
const CAT_AX_OFFSUIT = "Ax ?ㅽ봽?섑듃";
const CAT_BROADWAY_SUITED = "釉뚮줈?쒖썾???섎뵩";
const CAT_MIDDLE_PAIR = "誘몃뱾?뚯폆";
const CAT_LOW_PAIR = "濡쒖슦?뚯폆";
const CAT_SUITED_CONNECTOR = "而ㅻ꽖???섎뵩";

export function normalizeGameMode(raw: unknown): HoldemGameMode {
  return raw === "cost" ? "cost" : "classic";
}

function rankChar(r: number): string {
  return "23456789TJQKA"[r - 2] ?? "?";
}

function pair(
  id: string,
  r: number,
  maxUses: number,
  cat: string,
  cost = 0,
): HandPoolTemplate {
  const iaCategory =
    id.startsWith("hi_")
      ? CAT_HIGH_PAIR
      : id.startsWith("mid_")
        ? CAT_MIDDLE_PAIR
        : id.startsWith("low_")
          ? CAT_LOW_PAIR
          : (cat as OpponentHandCategory);
  return {
    id,
    iaCategory: iaCategory as OpponentHandCategory,
    kind: "pair",
    ranks: [r, r],
    maxUses,
    cost,
  };
}

function off(id: string, hi: number, lo: number, maxUses: number, cost = 0): HandPoolTemplate {
  return {
    id,
    iaCategory: CAT_AX_OFFSUIT as OpponentHandCategory,
    kind: "offsuit",
    ranks: [Math.max(hi, lo), Math.min(hi, lo)],
    maxUses,
    cost,
  };
}

function axSuited(id: string, hi: number, lo: number, cost: number): HandPoolTemplate {
  return {
    ...off(id, hi, lo, 1, cost),
    kind: "suited",
  };
}

function suited(
  id: string,
  hi: number,
  lo: number,
  maxUses: number,
  cat: string,
  cost = 0,
): HandPoolTemplate {
  const iaCategory =
    id.startsWith("bw_")
      ? CAT_BROADWAY_SUITED
      : id.startsWith("conn_")
        ? CAT_SUITED_CONNECTOR
        : (cat as OpponentHandCategory);
  return {
    id,
    iaCategory: iaCategory as OpponentHandCategory,
    kind: "suited",
    ranks: [Math.max(hi, lo), Math.min(hi, lo)],
    maxUses,
    cost,
  };
}

export const CLASSIC_HAND_TEMPLATES: HandPoolTemplate[] = [
  pair("hi_AA", 14, 1, "?섏씠?뚯폆"),
  pair("hi_KK", 13, 1, "?섏씠?뚯폆"),
  pair("hi_QQ", 12, 1, "?섏씠?뚯폆"),
  pair("hi_JJ", 11, 1, "?섏씠?뚯폆"),
  off("axo_AKo", 14, 13, 1),
  off("axo_AQo", 14, 12, 2),
  off("axo_AJo", 14, 11, 3),
  suited("bw_KQs", 13, 12, 2, "釉뚮줈?쒖썾???섎뵩"),
  suited("bw_KJs", 13, 11, 2, "釉뚮줈?쒖썾???섎뵩"),
  suited("bw_KTs", 13, 10, 2, "釉뚮줈?쒖썾???섎뵩"),
  suited("bw_QJs", 12, 11, 2, "釉뚮줈?쒖썾???섎뵩"),
  suited("bw_QTs", 12, 10, 2, "釉뚮줈?쒖썾???섎뵩"),
  suited("bw_JTs", 11, 10, 2, "釉뚮줈?쒖썾???섎뵩"),
  pair("mid_77", 7, 2, "誘몃뱾?뚯폆"),
  pair("mid_88", 8, 2, "誘몃뱾?뚯폆"),
  pair("mid_99", 9, 1, "誘몃뱾?뚯폆"),
  pair("mid_TT", 10, 1, "誘몃뱾?뚯폆"),
  ...([2, 3, 4, 5, 6] as const).map((r) =>
    pair(`low_${rankChar(r)}${rankChar(r)}`, r, 3, "濡쒖슦?뚯폆"),
  ),
  ...(() => {
    const conn: HandPoolTemplate[] = [];
    for (let lo = 2; lo <= 9; lo++) {
      const hi = lo + 1;
      conn.push(
        suited(
          `conn_${rankChar(lo)}${rankChar(hi)}s`,
          hi,
          lo,
          3,
          "而ㅻ꽖???섎뵩",
        ),
      );
    }
    return conn;
  })(),
];

const OFFICIAL_HAND_COSTS: Record<string, number> = {
  hi_AA: 18,
  hi_KK: 15,
  hi_QQ: 13,
  hi_JJ: 12,
  axs_AKs: 11,
  axs_AQs: 10,
  axs_AJs: 9,
  axs_ATs: 8,
  axo_AKo: 9,
  axo_AQo: 8,
  axo_AJo: 7,
  bw_KQs: 8,
  bw_KJs: 7,
  bw_QJs: 7,
  bw_KTs: 6,
  bw_QTs: 6,
  bw_JTs: 6,
  mid_TT: 10,
  mid_99: 9,
  mid_88: 8,
  mid_77: 7,
  low_66: 6,
  low_55: 5,
  low_44: 4,
  low_33: 3,
  low_22: 2,
  conn_9Ts: 5,
  conn_89s: 4,
  conn_78s: 4,
  conn_67s: 3,
  conn_56s: 3,
  conn_45s: 2,
  conn_34s: 2,
  conn_23s: 1,
};

export const COST_HAND_TEMPLATES: HandPoolTemplate[] = [
  pair("hi_AA", 14, 1, "?섏씠?뚯폆", OFFICIAL_HAND_COSTS.hi_AA!),
  pair("hi_KK", 13, 1, "?섏씠?뚯폆", OFFICIAL_HAND_COSTS.hi_KK!),
  pair("hi_QQ", 12, 1, "?섏씠?뚯폆", OFFICIAL_HAND_COSTS.hi_QQ!),
  pair("hi_JJ", 11, 1, "?섏씠?뚯폆", OFFICIAL_HAND_COSTS.hi_JJ!),
  axSuited("axs_AKs", 14, 13, OFFICIAL_HAND_COSTS.axs_AKs!),
  axSuited("axs_AQs", 14, 12, OFFICIAL_HAND_COSTS.axs_AQs!),
  axSuited("axs_AJs", 14, 11, OFFICIAL_HAND_COSTS.axs_AJs!),
  axSuited("axs_ATs", 14, 10, OFFICIAL_HAND_COSTS.axs_ATs!),
  off("axo_AKo", 14, 13, 1, OFFICIAL_HAND_COSTS.axo_AKo!),
  off("axo_AQo", 14, 12, 1, OFFICIAL_HAND_COSTS.axo_AQo!),
  off("axo_AJo", 14, 11, 1, OFFICIAL_HAND_COSTS.axo_AJo!),
  suited("bw_KQs", 13, 12, 1, "釉뚮줈?쒖썾???섎뵩", OFFICIAL_HAND_COSTS.bw_KQs!),
  suited("bw_KJs", 13, 11, 1, "釉뚮줈?쒖썾???섎뵩", OFFICIAL_HAND_COSTS.bw_KJs!),
  suited("bw_QJs", 12, 11, 1, "釉뚮줈?쒖썾???섎뵩", OFFICIAL_HAND_COSTS.bw_QJs!),
  suited("bw_KTs", 13, 10, 1, "釉뚮줈?쒖썾???섎뵩", OFFICIAL_HAND_COSTS.bw_KTs!),
  suited("bw_QTs", 12, 10, 1, "釉뚮줈?쒖썾???섎뵩", OFFICIAL_HAND_COSTS.bw_QTs!),
  suited("bw_JTs", 11, 10, 1, "釉뚮줈?쒖썾???섎뵩", OFFICIAL_HAND_COSTS.bw_JTs!),
  pair("mid_TT", 10, 1, "誘몃뱾?뚯폆", OFFICIAL_HAND_COSTS.mid_TT!),
  pair("mid_99", 9, 1, "誘몃뱾?뚯폆", OFFICIAL_HAND_COSTS.mid_99!),
  pair("mid_88", 8, 1, "誘몃뱾?뚯폆", OFFICIAL_HAND_COSTS.mid_88!),
  pair("mid_77", 7, 1, "誘몃뱾?뚯폆", OFFICIAL_HAND_COSTS.mid_77!),
  ...([2, 3, 4, 5, 6] as const).map((r) => {
    const id = `low_${rankChar(r)}${rankChar(r)}`;
    return pair(id, r, 1, "濡쒖슦?뚯폆", OFFICIAL_HAND_COSTS[id]!);
  }),
  ...(() => {
    const conn: HandPoolTemplate[] = [];
    for (let lo = 2; lo <= 9; lo++) {
      const hi = lo + 1;
      const id = `conn_${rankChar(lo)}${rankChar(hi)}s`;
      conn.push(suited(id, hi, lo, 1, "而ㅻ꽖???섎뵩", OFFICIAL_HAND_COSTS[id]!));
    }
    return conn;
  })(),
];

export const ALL_HAND_TEMPLATES: HandPoolTemplate[] = CLASSIC_HAND_TEMPLATES;

export function getHandTemplatesForMode(gameMode: HoldemGameMode): readonly HandPoolTemplate[] {
  return gameMode === "cost" ? COST_HAND_TEMPLATES : CLASSIC_HAND_TEMPLATES;
}

export function getHandTemplateForMode(
  gameMode: HoldemGameMode,
  templateId: string,
): HandPoolTemplate | undefined {
  return getHandTemplatesForMode(gameMode).find((t) => t.id === templateId);
}

export function getMaxUsesForMode(t: HandPoolTemplate, gameMode: HoldemGameMode): number {
  return gameMode === "cost" ? 1 : t.maxUses;
}

export function getInitialHandPoolRemaining(gameMode: HoldemGameMode): Record<string, number> {
  const m: Record<string, number> = {};
  for (const t of getHandTemplatesForMode(gameMode)) {
    m[t.id] = getMaxUsesForMode(t, gameMode);
  }
  return m;
}

export function initialPoolRemaining(): Record<string, number> {
  return getInitialHandPoolRemaining("classic");
}

export function normalizeHandPoolRemaining(
  raw: unknown,
  gameModeRaw: unknown = "classic",
): [Record<string, number>, Record<string, number>] {
  const gameMode = normalizeGameMode(gameModeRaw);
  const base = getInitialHandPoolRemaining(gameMode);
  const maxById = new Map(
    getHandTemplatesForMode(gameMode).map((t) => [t.id, getMaxUsesForMode(t, gameMode)]),
  );

  const mergePartial = (partial: unknown): Record<string, number> => {
    const out = { ...base };
    if (partial && typeof partial === "object" && !Array.isArray(partial)) {
      for (const [k, v] of Object.entries(partial as Record<string, unknown>)) {
        const max = maxById.get(k);
        if (typeof v === "number" && Number.isFinite(v) && v >= 0 && max != null) {
          out[k] = Math.min(max, Math.floor(v));
        }
      }
    }
    return out;
  };

  if (Array.isArray(raw)) {
    return [mergePartial(raw[0]), mergePartial(raw[1])];
  }
  if (raw && typeof raw === "object") {
    const shared = mergePartial(raw);
    return [{ ...shared }, { ...shared }];
  }
  return [mergePartial(undefined), mergePartial(undefined)];
}

function normalizeHandCostValue(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return HAND_COST_STARTING_POINTS;
  return Math.floor(v);
}

export function normalizeHandCostRemaining(
  raw: unknown,
  gameModeRaw: unknown = "classic",
): [number, number] {
  if (normalizeGameMode(gameModeRaw) !== "cost") return [0, 0];
  if (Array.isArray(raw)) {
    return [normalizeHandCostValue(raw[0]), normalizeHandCostValue(raw[1])];
  }
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    return [
      normalizeHandCostValue(r[0] ?? r.player1 ?? r.p0),
      normalizeHandCostValue(r[1] ?? r.player2 ?? r.p1),
    ];
  }
  return [HAND_COST_STARTING_POINTS, HAND_COST_STARTING_POINTS];
}

export function canSelectHandTemplate(
  state: Pick<GameState, "gameMode" | "handPoolRemaining" | "handCostRemaining">,
  player: PlayerIndex,
  t: HandPoolTemplate,
): boolean {
  const gameMode = normalizeGameMode(state.gameMode);
  const pools = normalizeHandPoolRemaining(state.handPoolRemaining as unknown, gameMode);
  if ((pools[player]?.[t.id] ?? 0) <= 0) return false;
  if (gameMode !== "cost") return true;
  const costs = normalizeHandCostRemaining(state.handCostRemaining as unknown, gameMode);
  return costs[player] >= t.cost;
}

export function findTemplate(id: string): HandPoolTemplate | undefined {
  return (
    getHandTemplateForMode("classic", id) ??
    getHandTemplateForMode("cost", id)
  );
}

export function holeFromTemplate(
  t: HandPoolTemplate,
  suits: [Suit, Suit],
): { ok: true; hole: [Card, Card] } | { ok: false; reason: string } {
  const [r1, r2] = t.ranks;
  if (t.kind === "pair") {
    if (suits[0] === suits[1]) return { ok: false, reason: "?섏뼱???쒕줈 ?ㅻⅨ 臾몄뼇?댁뼱???⑸땲??" };
    return {
      ok: true,
      hole: [
        { rank: r1, suit: suits[0] },
        { rank: r2, suit: suits[1] },
      ],
    };
  }
  if (t.kind === "suited") {
    if (suits[0] !== suits[1]) return { ok: false, reason: "?섎뵩 ?몃뱶??媛숈? 臾몄뼇?댁뼱???⑸땲??" };
    return {
      ok: true,
      hole: [
        { rank: r1, suit: suits[0] },
        { rank: r2, suit: suits[1] },
      ],
    };
  }
  if (suits[0] === suits[1]) return { ok: false, reason: "?ㅽ봽?섑듃???쒕줈 ?ㅻⅨ 臾몄뼇?댁뼱???⑸땲??" };
  return {
    ok: true,
    hole: [
      { rank: r1, suit: suits[0] },
      { rank: r2, suit: suits[1] },
    ],
  };
}

export function selectedHandFrom(t: HandPoolTemplate, hole: [Card, Card]): SelectedHand {
  return { templateId: t.id, hole, iaCategory: t.iaCategory };
}

export function templateLabel(t: HandPoolTemplate): string {
  if (t.kind === "pair") return `${rankChar(t.ranks[0]!)}${rankChar(t.ranks[1]!)}`;
  const a = rankChar(t.ranks[0]!);
  const b = rankChar(t.ranks[1]!);
  if (t.kind === "suited") return `${a}${b}s`;
  return `${a}${b}o`;
}

export function iaCategoryLabelKo(cat: OpponentHandCategory): string {
  if (cat === (CAT_HIGH_PAIR as OpponentHandCategory)) return "\ud558\uc774\ud30c\ucf13";
  if (cat === (CAT_AX_OFFSUIT as OpponentHandCategory)) return "Ax \uc624\ud504\uc218\ud2b8";
  if (cat === (CAT_BROADWAY_SUITED as OpponentHandCategory)) return "\ube0c\ub85c\ub4dc\uc6e8\uc774 \uc218\ub527";
  if (cat === (CAT_MIDDLE_PAIR as OpponentHandCategory)) return "\ubbf8\ub4e4\ud30c\ucf13";
  if (cat === (CAT_LOW_PAIR as OpponentHandCategory)) return "\ub85c\uc6b0\ud30c\ucf13";
  if (cat === (CAT_SUITED_CONNECTOR as OpponentHandCategory)) return "\ucee4\ub125\ud130 \uc218\ub527";
  return String(cat);
}

export function iaCategoryLabelEn(cat: OpponentHandCategory): string {
  if (cat === (CAT_HIGH_PAIR as OpponentHandCategory)) return "High Pairs";
  if (cat === (CAT_AX_OFFSUIT as OpponentHandCategory)) return "Ax Offsuit";
  if (cat === (CAT_BROADWAY_SUITED as OpponentHandCategory)) return "Broadway Suited";
  if (cat === (CAT_MIDDLE_PAIR as OpponentHandCategory)) return "Middle Pairs";
  if (cat === (CAT_LOW_PAIR as OpponentHandCategory)) return "Low Pairs";
  if (cat === (CAT_SUITED_CONNECTOR as OpponentHandCategory)) return "Suited Connectors";
  return String(cat);
}

export function iaCategoryHandListText(cat: OpponentHandCategory): string {
  const labels: string[] = [];
  for (const t of CLASSIC_HAND_TEMPLATES) {
    if (t.iaCategory === cat) labels.push(templateLabel(t));
  }
  return labels.join(", ");
}

function cardKey(c: Card): string {
  return `${c.rank}:${c.suit}`;
}

export function allConcreteHolesForTemplate(t: HandPoolTemplate): [Card, Card][] {
  const [r1, r2] = t.ranks;
  if (t.kind === "pair") {
    const r = t.ranks[0]!;
    const opts: [Card, Card][] = [];
    for (let i = 0; i < SUITS.length; i++) {
      for (let j = i + 1; j < SUITS.length; j++) {
        opts.push([
          { rank: r, suit: SUITS[i]! },
          { rank: r, suit: SUITS[j]! },
        ]);
      }
    }
    return opts;
  }
  if (t.kind === "suited") {
    return SUITS.map(
      (s): [Card, Card] => [
        { rank: r1, suit: s },
        { rank: r2, suit: s },
      ],
    );
  }
  const opts: [Card, Card][] = [];
  for (const s1 of SUITS) {
    for (const s2 of SUITS) {
      if (s1 === s2) continue;
      opts.push([
        { rank: r1, suit: s1 },
        { rank: r2, suit: s2 },
      ]);
    }
  }
  return opts;
}

function disjointHoles(a: [Card, Card], b: [Card, Card]): boolean {
  const s = new Set([cardKey(a[0]!), cardKey(a[1]!)]);
  return !s.has(cardKey(b[0]!)) && !s.has(cardKey(b[1]!));
}

export function resolvePendingHandPicks(
  p0: HandPickPending,
  p1: HandPickPending,
  rng: () => number,
  gameModeRaw: unknown = "classic",
):
  | { ok: true; hole0: [Card, Card]; hole1: [Card, Card]; t0: HandPoolTemplate; t1: HandPoolTemplate }
  | { ok: false } {
  const gameMode = normalizeGameMode(gameModeRaw);
  const t0 = getHandTemplateForMode(gameMode, p0.templateId);
  const t1 = getHandTemplateForMode(gameMode, p1.templateId);
  if (!t0 || !t1) return { ok: false };

  const opts0 = allConcreteHolesForTemplate(t0);
  const opts1 = allConcreteHolesForTemplate(t1);
  if (opts0.length === 0 || opts1.length === 0) return { ok: false };

  const candidates: { hole0: [Card, Card]; hole1: [Card, Card] }[] = [];
  for (const h0 of opts0) {
    for (const h1 of opts1) {
      if (disjointHoles(h0, h1)) candidates.push({ hole0: h0, hole1: h1 });
    }
  }
  if (candidates.length === 0) return { ok: false };
  const picked = candidates[Math.floor(rng() * candidates.length)]!;
  return {
    ok: true,
    hole0: picked.hole0,
    hole1: picked.hole1,
    t0,
    t1,
  };
}
