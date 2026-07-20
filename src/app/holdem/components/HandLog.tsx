'use client';

import * as React from "react";
import { cardLabel, type Card } from "@/holdem/cards";
import { getBlindLevel } from "@/holdem/blindLevels";
import { chipsAsBbLabel } from "@/holdem/formatBb";
import {
  findTemplate,
  iaCategoryHandListText,
  iaCategoryLabelEn,
  iaCategoryLabelKo,
  templateLabel,
} from "@/holdem/handPool";
import { useHoldemI18n } from "@/holdem/i18n/HoldemLocaleProvider";
import {
  best5Of7,
  handValueDisplayForLocale,
} from "@/holdem/pokerEval";
import type { HoldemUiLocale } from "@/holdem/holdemPrefs";
import type { GameMessage, HoldemGameMode, PlayerIndex, SelectedHand, Street } from "@/holdem/types";

type Pl = (p: PlayerIndex) => string;

function actionLabel(action: string, locale: HoldemUiLocale): string {
  if (locale !== "en") return action;
  const labels: Record<string, string> = {
    "콜": "Call",
    "레이즈": "Raise",
    "올인": "All-in",
    "올인 콜": "All-in call",
    "베트": "Bet",
    "체크": "Check",
    "체크(자동)": "Auto-check",
    "폴드": "Fold",
  };
  return labels[action] ?? action;
}

function legacyHandSummaryForLocale(
  summary: string,
  locale: HoldemUiLocale,
): string {
  if (locale !== "en") return summary;
  const pair = summary.match(/^([2-9TJQKA]) 원페어$/);
  if (pair) return `Pair of ${pair[1]}`;
  const twoPair = summary.match(/^([2-9TJQKA]), ([2-9TJQKA]) 투페어$/);
  if (twoPair) return `Two pair, ${twoPair[1]}s and ${twoPair[2]}s`;
  return summary
    .replace("스트레이트 플러시", "straight flush")
    .replace("하이카드", "high")
    .replace("원페어", "pair")
    .replace("투페어", "two pair")
    .replace("트리플", "trips")
    .replace("스트레이트", "straight")
    .replace("플러시", "flush")
    .replace("풀하우스", "full house")
    .replace("포카드", "quads");
}

function fmtPreflop(
  m: Extract<GameMessage, { t: "preflop_action" }>,
  pl: Pl,
  bbUnit: number,
  locale: HoldemUiLocale,
): string {
  const isEn = locale === "en";
  const amt = m.amount != null ? chipsAsBbLabel(m.amount, bbUnit) : "";
  const who = pl(m.player);
  if (m.action === "콜" && m.amount != null) {
    return `${who}: ${isEn ? "Call" : "콜"} (${isEn ? "total" : "총"} ${amt})`;
  }
  if (m.action === "레이즈" && m.amount != null) {
    return `${who}: ${isEn ? "Raise" : "레이즈"} → ${isEn ? "total" : "총"} ${amt}`;
  }
  if (m.action === "올인" && m.amount != null) {
    return `${who}: ${isEn ? "All-in" : "올인"} → ${isEn ? "total" : "총"} ${amt}`;
  }
  return `${who}: ${actionLabel(m.action, locale)}${amt ? ` (${amt})` : ""}`;
}

function fmtPost(
  m: Extract<GameMessage, { t: "postflop_action" }>,
  pl: Pl,
  bbUnit: number,
  locale: HoldemUiLocale,
): string {
  const isEn = locale === "en";
  const amt = m.amount != null ? chipsAsBbLabel(m.amount, bbUnit) : "";
  const who = pl(m.player);
  if (m.action === "콜" && m.amount != null) {
    return `${who}: ${isEn ? "Call" : "콜"} (+${amt})`;
  }
  if (m.action === "베트" && m.amount != null) {
    return `${who}: ${isEn ? "Bet" : "베트"} ${amt}`;
  }
  if (m.action === "레이즈" && m.amount != null) {
    return `${who}: ${isEn ? "Raise" : "레이즈"} → ${isEn ? "total" : "총"} ${amt}`;
  }
  return `${who}: ${actionLabel(m.action, locale)}${amt ? ` (${amt})` : ""}`;
}

type Section = { title: string; lines: string[] };

function lastShowdownIn(
  logs: GameMessage[],
): Extract<GameMessage, { t: "showdown" }> | null {
  for (let i = logs.length - 1; i >= 0; i--) {
    const m = logs[i]!;
    if (m.t === "showdown") return m;
  }
  return null;
}

function isFoldShowdown(m: Extract<GameMessage, { t: "showdown" }>): boolean {
  return (
    m.winners.length === 1 &&
    (m.folder != null || m.desc.includes("폴드"))
  );
}

/** 구버전 로그 desc의 P0/P1을 표시 이름으로 치환 */
function humanizeLegacyShowdownDesc(
  desc: string,
  pl: (p: PlayerIndex) => string,
): string {
  return desc.replace(/\bP0\b/g, pl(0)).replace(/\bP1\b/g, pl(1));
}

function findLastRoundStartBefore(logs: GameMessage[], idx: number): number {
  for (let j = idx; j >= 0; j--) {
    if (logs[j]!.t === "round_start") return j;
  }
  return -1;
}

/** `roundStartIdx` 이후 ~ 다음 `round_start` 전에 `showdown`이 있으면 해당 핸드는 종료된 것으로 본다. */
function segmentHasShowdown(logs: GameMessage[], roundStartIdx: number): boolean {
  for (let j = roundStartIdx + 1; j < logs.length; j++) {
    const m = logs[j]!;
    if (m.t === "round_start") return false;
    if (m.t === "showdown") return true;
  }
  return false;
}

function shouldRevealHandChosenLabel(
  logs: GameMessage[],
  messageIndex: number,
): boolean {
  const r = findLastRoundStartBefore(logs, messageIndex);
  if (r < 0) return false;
  return segmentHasShowdown(logs, r);
}

function buildSections(
  logs: GameMessage[],
  playerNames: [string, string],
  showdownHoleCtx: { holes: [SelectedHand, SelectedHand]; board: Card[] } | null,
  playMode: "local" | "online" | "single" | undefined,
  gameMode: HoldemGameMode,
  locale: HoldemUiLocale,
): Section[] {
  const isEn = locale === "en";
  const names = isEn
    ? {
        setup: "HAND SETUP",
        preflop: "PREFLOP",
        flop: "FLOP",
        turn: "TURN",
        river: "RIVER",
        result: "IA / HAND RESULT",
      }
    : {
        setup: "핸드 준비",
        preflop: "프리플랍",
        flop: "플랍",
        turn: "턴",
        river: "리버",
        result: "IA / 판 결과",
      };
  const postNames: Partial<Record<Street, string>> = {
    flop: names.flop,
    turn: names.turn,
    river: names.river,
  };
  const pl = (p: PlayerIndex) =>
    playerNames[p] ?? `${isEn ? "Player" : "플레이어"} ${p + 1}`;
  const lastSd = lastShowdownIn(logs);
  const out: Section[] = [];
  let setup: string[] = [];
  let preflop: string[] | null = null;
  let streetPost: { title: string; lines: string[] } | null = null;
  let endLines: string[] | null = null;
  /** 로그 상 해당 시점 라운드의 BB 칩 크기(금액→bb 표기용) */
  let logBlindBbUnit = getBlindLevel(1, gameMode).bigBlind;

  const pushStreet = () => {
    if (streetPost != null && streetPost.lines.length > 0) {
      out.push({ title: streetPost.title, lines: streetPost.lines });
    }
    streetPost = null;
  };

  const pushPreflop = () => {
    if (preflop != null && preflop.length > 0) {
      out.push({ title: names.preflop, lines: preflop });
    }
    preflop = null;
  };

  const pushSetup = () => {
    if (setup.length > 0) {
      out.push({ title: names.setup, lines: setup });
      setup = [];
    }
  };

  const pushEnd = () => {
    if (endLines != null && endLines.length > 0) {
      out.push({ title: names.result, lines: endLines });
    }
    endLines = null;
  };

  const ensurePost = (fallback: string) => {
    if (streetPost == null) {
      streetPost = { title: fallback, lines: [] };
    }
  };

  const appendShowdownHoleLines = (
    m: Extract<GameMessage, { t: "showdown" }>,
  ) => {
    if (
      showdownHoleCtx == null ||
      lastSd == null ||
      m !== lastSd ||
      isFoldShowdown(m)
    ) {
      return;
    }
    const [h0, h1] = showdownHoleCtx.holes;
    const board = showdownHoleCtx.board;
    for (const p of [0, 1] as const) {
      const sel = p === 0 ? h0 : h1;
      const t = sel.templateId ? findTemplate(sel.templateId) : null;
      const pool = t
        ? templateLabel(t)
        : sel.acquisitionType === "mystery" ? "Mystery Hand" : "Random Hand";
      const v = best5Of7([...sel.hole, ...board]);
      endLines!.push(
        isEn
          ? `${pl(p)} hand: pool ${pool} · hole ${sel.hole.map(cardLabel).join(" ")} — ${handValueDisplayForLocale(v, locale)}`
          : `${pl(p)} 핸드: 풀 ${pool} · 홀 ${sel.hole.map(cardLabel).join(" ")} — ${handValueDisplayForLocale(v, locale)}`,
      );
    }
  };

  for (let mi = 0; mi < logs.length; mi++) {
    const m = logs[mi]!;
    switch (m.t) {
      case "round_start":
        pushEnd();
        pushStreet();
        pushPreflop();
        logBlindBbUnit = getBlindLevel(m.round, gameMode).bigBlind;
        setup = [isEn ? `Round ${m.round} started` : `라운드 ${m.round} 시작`];
        break;
      case "hand_pick_conflict":
        setup.push(isEn ? "Hole-card collision — pick again" : "홀카드 충돌 — 재선택");
        break;
      case "hand_chosen": {
        const revealPool =
          playMode === "local" && shouldRevealHandChosenLabel(logs, mi);
        setup.push(
          revealPool
            ? isEn
              ? `${pl(m.player)} hand: ${m.label}`
              : `${pl(m.player)} 핸드: ${m.label}`
            : isEn
              ? `${pl(m.player)}: hand locked (hidden)`
              : `${pl(m.player)}: 핸드 선택 완료 (비공개)`,
        );
        break;
      }
      case "preflop_action":
        if (setup.length > 0) pushSetup();
        if (preflop == null) preflop = [];
        preflop.push(fmtPreflop(m, pl, logBlindBbUnit, locale));
        break;
      case "street_cards": {
        if (setup.length > 0) pushSetup();
        if (m.street === "flop") {
          if (preflop == null) preflop = [];
          preflop.push(
            isEn
              ? `Preflop complete · Pot ${chipsAsBbLabel(m.pot, logBlindBbUnit)}`
              : `프리플랍 종료 · 팟 ${chipsAsBbLabel(m.pot, logBlindBbUnit)}`,
          );
        }
        if (m.street === "turn" && streetPost?.title === names.flop) {
          streetPost.lines.push(
            isEn
              ? `Flop complete · Pot ${chipsAsBbLabel(m.pot, logBlindBbUnit)}`
              : `플랍 종료 · 팟 ${chipsAsBbLabel(m.pot, logBlindBbUnit)}`,
          );
        }
        if (m.street === "river" && streetPost?.title === names.turn) {
          streetPost.lines.push(
            isEn
              ? `Turn complete · Pot ${chipsAsBbLabel(m.pot, logBlindBbUnit)}`
              : `턴 종료 · 팟 ${chipsAsBbLabel(m.pot, logBlindBbUnit)}`,
          );
        }
        pushPreflop();
        pushStreet();
        const name = postNames[m.street];
        if (name != null) {
          streetPost = {
            title: name,
            lines: [
              `${isEn ? "Board" : "보드"}: ${m.cards.map(cardLabel).join(" ")}`,
            ],
          };
        }
        break;
      }
      case "postflop_action":
        ensurePost(names.flop);
        streetPost!.lines.push(fmtPost(m, pl, logBlindBbUnit, locale));
        break;
      case "ia":
        pushStreet();
        pushPreflop();
        if (endLines == null) endLines = [];
        endLines.push(
          m.acquisitionType === "mystery"
            ? isEn
              ? `${pl(m.player)}: IA (−${chipsAsBbLabel(m.cost, logBlindBbUnit)}) → Opponent received a Mystery Hand.`
              : `${pl(m.player)}: IA (−${chipsAsBbLabel(m.cost, logBlindBbUnit)}) → 상대는 Mystery Hand입니다.`
            : m.acquisitionType === "forced-random"
              ? isEn
                ? `${pl(m.player)}: IA (−${chipsAsBbLabel(m.cost, logBlindBbUnit)}) → Opponent received a Random Hand. No category is revealed.`
                : `${pl(m.player)}: IA (−${chipsAsBbLabel(m.cost, logBlindBbUnit)}) → 상대는 Random Hand를 지급받았습니다. 카테고리가 제공되지 않습니다.`
              : isEn
                ? `${pl(m.player)}: IA (−${chipsAsBbLabel(m.cost, logBlindBbUnit)}) → Opponent category: ${iaCategoryLabelEn(m.revealedCategory!)} (${iaCategoryHandListText(m.revealedCategory!)})`
                : `${pl(m.player)}: IA (−${chipsAsBbLabel(m.cost, logBlindBbUnit)}) → 상대 카테고리: ${iaCategoryLabelKo(m.revealedCategory!)} (${iaCategoryHandListText(m.revealedCategory!)})`,
        );
        break;
      case "showdown": {
        if (preflop != null) {
          preflop.push(
            isEn
              ? `Preflop complete · Pot ${chipsAsBbLabel(m.pot, logBlindBbUnit)}`
              : `프리플랍 종료 · 팟 ${chipsAsBbLabel(m.pot, logBlindBbUnit)}`,
          );
        }
        if (streetPost?.title === names.flop) {
          streetPost.lines.push(
            isEn
              ? `Flop complete · Pot ${chipsAsBbLabel(m.pot, logBlindBbUnit)}`
              : `플랍 종료 · 팟 ${chipsAsBbLabel(m.pot, logBlindBbUnit)}`,
          );
        } else if (streetPost?.title === names.turn) {
          streetPost.lines.push(
            isEn
              ? `Turn complete · Pot ${chipsAsBbLabel(m.pot, logBlindBbUnit)}`
              : `턴 종료 · 팟 ${chipsAsBbLabel(m.pot, logBlindBbUnit)}`,
          );
        } else if (streetPost?.title === names.river) {
          streetPost.lines.push(
            isEn
              ? `River complete · Pot ${chipsAsBbLabel(m.pot, logBlindBbUnit)}`
              : `리버 종료 · 팟 ${chipsAsBbLabel(m.pot, logBlindBbUnit)}`,
          );
        }
        pushStreet();
        pushPreflop();
        const lastSec = out[out.length - 1];
        if (
          lastSec?.title === names.river &&
          !lastSec.lines.some((l) =>
            l.startsWith(isEn ? "River complete · Pot" : "리버 종료 · 팟"),
          )
        ) {
          lastSec.lines.push(
            isEn
              ? `River complete · Pot ${chipsAsBbLabel(m.pot, logBlindBbUnit)}`
              : `리버 종료 · 팟 ${chipsAsBbLabel(m.pot, logBlindBbUnit)}`,
          );
        }
        if (endLines == null) endLines = [];
        const showdownLine =
          m.folder != null
            ? `${pl(m.folder)} ${isEn ? "folded" : "폴드"}`
            : m.hands
              ? `${pl(0)} ${legacyHandSummaryForLocale(m.hands[0], locale)} vs ${pl(1)} ${legacyHandSummaryForLocale(m.hands[1], locale)}`
              : humanizeLegacyShowdownDesc(m.desc, pl);
        const resultLead =
          m.winners.length > 1
            ? `${isEn ? "Split" : "분배"}: ${m.winners.map((w) => pl(w)).join(", ")}`
            : `${isEn ? "Winner" : "승"}: ${m.winners.map((w) => pl(w)).join(", ")}`;
        endLines.push(
          `${showdownLine} · ${isEn ? "Pot" : "팟"} ${chipsAsBbLabel(m.pot, logBlindBbUnit)} (${resultLead})`,
        );
        appendShowdownHoleLines(m);
        break;
      }
      case "player_busted":
        if (endLines == null) endLines = [];
        endLines.push(`${pl(m.player)} ${isEn ? "busted" : "버스트"}`);
        break;
      default:
        break;
    }
  }

  pushEnd();
  pushStreet();
  pushPreflop();
  pushSetup();

  return out;
}

export type HandLogProps = {
  logs: GameMessage[];
  playerNames: [string, string];
  /** 쇼다운 직후에만 전달 — 마지막 `showdown` 블록에 양쪽 홀·족보를 붙입니다. */
  showdownHoleCtx?: { holes: [SelectedHand, SelectedHand]; board: Card[] } | null;
  /** 온라인: 풀 핸드 라벨·홀 상세 로그 비표시(동일 기기 공유 시 정보 누출 방지). */
  playMode?: "local" | "online" | "single";
  gameMode?: HoldemGameMode;
};

export function HandLog({
  logs,
  playerNames,
  showdownHoleCtx = null,
  playMode = "local",
  gameMode = "classic",
}: HandLogProps) {
  const { locale } = useHoldemI18n();
  const isEn = locale === "en";
  const [open, setOpen] = React.useState(true);
  const recent = React.useMemo(() => logs.slice(-140), [logs]);
  const sections = React.useMemo(
    () =>
      buildSections(
        recent,
        playerNames,
        showdownHoleCtx ?? null,
        playMode,
        gameMode,
        locale,
      ),
    [recent, playerNames, showdownHoleCtx, playMode, gameMode, locale],
  );
  const tail = sections.slice(-10);

  return (
    <details
      className="rounded-xl border border-zinc-600/90 bg-zinc-700/55 p-3"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="mb-0.5 cursor-pointer list-none text-xs font-semibold text-zinc-200">
        <span className="inline-flex items-center gap-2">
          {isEn ? "Hand Log" : "핸드 로그"}
          <span className="rounded bg-zinc-600/60 px-1 py-px text-[9px] font-normal uppercase tracking-wide text-zinc-400">
            {isEn ? "Expand · Collapse" : "펼치기 · 접기"}
          </span>
        </span>
      </summary>
      <div className="mt-3 max-h-[22rem] overflow-y-auto">
        <div className="space-y-3">
          {tail.map((sec, si) => (
            <div
              key={`${sec.title}-${si}`}
              className="rounded-lg border border-zinc-600/70 bg-zinc-800/55 p-2.5"
            >
              <div className="mb-2 border-b border-zinc-600/80 pb-1 text-[10px] font-bold uppercase tracking-wider text-amber-400">
                [{sec.title}]
              </div>
              <ul className="space-y-1.5">
                {sec.lines.map((line, li) => (
                  <li
                    key={li}
                    className="grid grid-cols-[auto_1fr] gap-x-2 font-mono text-[11px] leading-snug text-zinc-200"
                  >
                    <span className="select-none text-zinc-500">{li + 1}.</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}
