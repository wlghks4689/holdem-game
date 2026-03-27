import type { Card, Suit } from "./cards";
import type {
  HandPickPending,
  HandPoolTemplate,
  OpponentHandCategory,
  SelectedHand,
} from "./types";

export const SUITS: Suit[] = ["c", "d", "h", "s"];

function rankChar(r: number): string {
  return "23456789TJQKA"[r - 2] ?? "?";
}

function pair(id: string, r: number, uses: number, cat: OpponentHandCategory): HandPoolTemplate {
  return { id, iaCategory: cat, kind: "pair", ranks: [r, r], maxUses: uses };
}

function off(id: string, hi: number, lo: number, uses: number): HandPoolTemplate {
  /* 항상 높은 랭크가 ranks[0] */
  return {
    id,
    iaCategory: "Ax 오프수트",
    kind: "offsuit",
    ranks: [Math.max(hi, lo), Math.min(hi, lo)],
    maxUses: uses,
  };
}

function suited(id: string, hi: number, lo: number, uses: number, cat: OpponentHandCategory): HandPoolTemplate {
  return {
    id,
    iaCategory: cat,
    kind: "suited",
    ranks: [Math.max(hi, lo), Math.min(hi, lo)],
    maxUses: uses,
  };
}

/** 스펙 기준 전체 템플릿 (커넥터: 23s ~ T9s, 한 단위 간격만) */
export const ALL_HAND_TEMPLATES: HandPoolTemplate[] = [
  pair("hi_AA", 14, 1, "하이파켓"),
  pair("hi_KK", 13, 1, "하이파켓"),
  pair("hi_QQ", 12, 1, "하이파켓"),
  pair("hi_JJ", 11, 1, "하이파켓"),
  off("axo_AKo", 14, 13, 1),
  off("axo_AQo", 14, 12, 2),
  off("axo_AJo", 14, 11, 3),
  suited("bw_KQs", 13, 12, 2, "브로드웨이 수딧"),
  suited("bw_KJs", 13, 11, 2, "브로드웨이 수딧"),
  suited("bw_KTs", 13, 10, 2, "브로드웨이 수딧"),
  suited("bw_QJs", 12, 11, 2, "브로드웨이 수딧"),
  suited("bw_QTs", 12, 10, 2, "브로드웨이 수딧"),
  suited("bw_JTs", 11, 10, 2, "브로드웨이 수딧"),
  pair("mid_77", 7, 2, "미들파켓"),
  pair("mid_88", 8, 2, "미들파켓"),
  pair("mid_99", 9, 1, "미들파켓"),
  pair("mid_TT", 10, 1, "미들파켓"),
  ...([2, 3, 4, 5, 6] as const).map((r) => pair(`low_${rankChar(r)}${rankChar(r)}`, r, 3, "로우파켓")),
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
          "커넥터 수딧",
        ),
      );
    }
    return conn;
  })(),
];

export function initialPoolRemaining(): Record<string, number> {
  const m: Record<string, number> = {};
  for (const t of ALL_HAND_TEMPLATES) m[t.id] = t.maxUses;
  return m;
}

/**
 * P0/P1 튜플로 고정. 예전 단일 Record나 빈 슬롯이면 템플릿 기본값으로 채운다.
 */
export function normalizeHandPoolRemaining(raw: unknown): [Record<string, number>, Record<string, number>] {
  const base = initialPoolRemaining();

  const mergePartial = (partial: unknown): Record<string, number> => {
    const out = { ...base };
    if (partial && typeof partial === "object" && !Array.isArray(partial)) {
      for (const [k, v] of Object.entries(partial as Record<string, unknown>)) {
        if (typeof v === "number" && Number.isFinite(v) && v >= 0) out[k] = v;
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

export function findTemplate(id: string): HandPoolTemplate | undefined {
  return ALL_HAND_TEMPLATES.find((t) => t.id === id);
}

export function holeFromTemplate(
  t: HandPoolTemplate,
  suits: [Suit, Suit],
): { ok: true; hole: [Card, Card] } | { ok: false; reason: string } {
  const [r1, r2] = t.ranks;
  if (t.kind === "pair") {
    if (suits[0] === suits[1]) return { ok: false, reason: "페어는 서로 다른 문양이어야 합니다." };
    return {
      ok: true,
      hole: [
        { rank: r1, suit: suits[0] },
        { rank: r2, suit: suits[1] },
      ],
    };
  }
  if (t.kind === "suited") {
    if (suits[0] !== suits[1]) return { ok: false, reason: "수딧 핸드는 같은 문양이어야 합니다." };
    return {
      ok: true,
      hole: [
        { rank: r1, suit: suits[0] },
        { rank: r2, suit: suits[1] },
      ],
    };
  }
  if (suits[0] === suits[1]) return { ok: false, reason: "오프수트는 서로 다른 문양이어야 합니다." };
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

/** IA 카테고리에 속한 핸드 풀 조합을 `templateLabel` 순으로 나열 (예: 로우파켓 → 22, 33, …) */
export function iaCategoryHandListText(cat: OpponentHandCategory): string {
  const labels: string[] = [];
  for (const t of ALL_HAND_TEMPLATES) {
    if (t.iaCategory === cat) labels.push(templateLabel(t));
  }
  return labels.join(", ");
}

function cardKey(c: Card): string {
  return `${c.rank}:${c.suit}`;
}

/** 52장 덱 기준 해당 템플릿의 모든 유효 홀 (충돌 해소용; 사용자가 고른 문양과 달라질 수 있음) */
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

/**
 * 두 명의 pending을 52장 덱 규칙(홀 4장 서로 다름)으로 만족하는 실제 홀로 해석.
 * 유효한 (홀0, 홀1) 조합 목록에서 `rng`로 균등 무작위 1개를 고른다.
 */
export function resolvePendingHandPicks(
  p0: HandPickPending,
  p1: HandPickPending,
  rng: () => number,
):
  | { ok: true; hole0: [Card, Card]; hole1: [Card, Card]; t0: HandPoolTemplate; t1: HandPoolTemplate }
  | { ok: false } {
  const t0 = findTemplate(p0.templateId);
  const t1 = findTemplate(p1.templateId);
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
