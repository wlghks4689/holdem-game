'use client';

import * as React from "react";
import { cardLabel, type Card } from "@/holdem/cards";
import { chipsAsBbLabel } from "@/holdem/formatBb";
import {
  findTemplate,
  iaCategoryHandListText,
  templateLabel,
} from "@/holdem/handPool";
import { best5Of7, handValueSummaryKorean } from "@/holdem/pokerEval";
import type { GameMessage, PlayerIndex, SelectedHand, Street } from "@/holdem/types";

type Pl = (p: PlayerIndex) => string;

function fmtPreflop(
  m: Extract<GameMessage, { t: "preflop_action" }>,
  pl: Pl,
): string {
  const amt = m.amount != null ? chipsAsBbLabel(m.amount) : "";
  const who = pl(m.player);
  if (m.action === "콜" && m.amount != null) {
    return `${who}: 콜 (총 ${amt})`;
  }
  if (m.action === "레이즈" && m.amount != null) {
    return `${who}: 레이즈 → 총 ${amt}`;
  }
  return `${who}: ${m.action}${amt ? ` (${amt})` : ""}`;
}

function fmtPost(
  m: Extract<GameMessage, { t: "postflop_action" }>,
  pl: Pl,
): string {
  const amt = m.amount != null ? chipsAsBbLabel(m.amount) : "";
  const who = pl(m.player);
  if (m.action === "콜" && m.amount != null) {
    return `${who}: 콜 (+${amt})`;
  }
  if (m.action === "베트" && m.amount != null) {
    return `${who}: 베트 ${amt}`;
  }
  if (m.action === "레이즈" && m.amount != null) {
    return `${who}: 레이즈 → 총 ${amt}`;
  }
  return `${who}: ${m.action}${amt ? ` (${amt})` : ""}`;
}

type Section = { title: string; lines: string[] };

const POST_NAMES: Partial<Record<Street, string>> = {
  flop: "플랍",
  turn: "턴",
  river: "리버",
};

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
  playMode: "local" | "online",
): Section[] {
  const pl = (p: PlayerIndex) => playerNames[p] ?? `플레이어 ${p + 1}`;
  const lastSd = lastShowdownIn(logs);
  const out: Section[] = [];
  let setup: string[] = [];
  let preflop: string[] | null = null;
  let streetPost: { title: string; lines: string[] } | null = null;
  let endLines: string[] | null = null;

  const pushStreet = () => {
    if (streetPost != null && streetPost.lines.length > 0) {
      out.push({ title: streetPost.title, lines: streetPost.lines });
    }
    streetPost = null;
  };

  const pushPreflop = () => {
    if (preflop != null && preflop.length > 0) {
      out.push({ title: "프리플랍", lines: preflop });
    }
    preflop = null;
  };

  const pushSetup = () => {
    if (setup.length > 0) {
      out.push({ title: "핸드 준비", lines: setup });
      setup = [];
    }
  };

  const pushEnd = () => {
    if (endLines != null && endLines.length > 0) {
      out.push({ title: "IA / 판 결과", lines: endLines });
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
      const t = findTemplate(sel.templateId);
      const pool = t ? templateLabel(t) : sel.templateId;
      const v = best5Of7([...sel.hole, ...board]);
      endLines!.push(
        `${pl(p)} 핸드: 풀 ${pool} · 홀 ${sel.hole.map(cardLabel).join(" ")} — ${handValueSummaryKorean(v)}`,
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
        setup = [`라운드 ${m.round} 시작`];
        break;
      case "hand_pick_conflict":
        setup.push("홀카드 충돌 — 재선택");
        break;
      case "hand_chosen": {
        const revealPool =
          playMode === "local" && shouldRevealHandChosenLabel(logs, mi);
        setup.push(
          revealPool
            ? `${pl(m.player)} 핸드: ${m.label}`
            : `${pl(m.player)}: 핸드 선택 완료 (비공개)`,
        );
        break;
      }
      case "preflop_action":
        if (setup.length > 0) pushSetup();
        if (preflop == null) preflop = [];
        preflop.push(fmtPreflop(m, pl));
        break;
      case "street_cards": {
        if (setup.length > 0) pushSetup();
        if (m.street === "flop") {
          if (preflop == null) preflop = [];
          preflop.push(`프리플랍 종료 · 팟 ${chipsAsBbLabel(m.pot)}`);
        }
        if (m.street === "turn" && streetPost?.title === "플랍") {
          streetPost.lines.push(`플랍 종료 · 팟 ${chipsAsBbLabel(m.pot)}`);
        }
        if (m.street === "river" && streetPost?.title === "턴") {
          streetPost.lines.push(`턴 종료 · 팟 ${chipsAsBbLabel(m.pot)}`);
        }
        pushPreflop();
        pushStreet();
        const name = POST_NAMES[m.street];
        if (name != null) {
          streetPost = {
            title: name,
            lines: [`보드: ${m.cards.map(cardLabel).join(" ")}`],
          };
        }
        break;
      }
      case "postflop_action":
        ensurePost("플랍");
        streetPost!.lines.push(fmtPost(m, pl));
        break;
      case "ia":
        pushStreet();
        pushPreflop();
        if (endLines == null) endLines = [];
        endLines.push(
          `${pl(m.player)}: IA (−${chipsAsBbLabel(m.cost)}) → 상대 카테고리: ${m.revealedCategory} (${iaCategoryHandListText(m.revealedCategory)})`,
        );
        break;
      case "showdown": {
        if (preflop != null) {
          preflop.push(`프리플랍 종료 · 팟 ${chipsAsBbLabel(m.pot)}`);
        }
        if (streetPost?.title === "플랍") {
          streetPost.lines.push(`플랍 종료 · 팟 ${chipsAsBbLabel(m.pot)}`);
        } else if (streetPost?.title === "턴") {
          streetPost.lines.push(`턴 종료 · 팟 ${chipsAsBbLabel(m.pot)}`);
        } else if (streetPost?.title === "리버") {
          streetPost.lines.push(`리버 종료 · 팟 ${chipsAsBbLabel(m.pot)}`);
        }
        pushStreet();
        pushPreflop();
        const lastSec = out[out.length - 1];
        if (
          lastSec?.title === "리버" &&
          !lastSec.lines.some((l) => l.startsWith("리버 종료 · 팟"))
        ) {
          lastSec.lines.push(`리버 종료 · 팟 ${chipsAsBbLabel(m.pot)}`);
        }
        if (endLines == null) endLines = [];
        const showdownLine =
          m.folder != null
            ? `${pl(m.folder)} 폴드`
            : m.hands
              ? `${pl(0)} ${m.hands[0]} vs ${pl(1)} ${m.hands[1]}`
              : humanizeLegacyShowdownDesc(m.desc, pl);
        endLines.push(
          `${showdownLine} · 팟 ${chipsAsBbLabel(m.pot)} (승: ${m.winners.map((w) => pl(w)).join(", ")})`,
        );
        appendShowdownHoleLines(m);
        break;
      }
      case "player_busted":
        if (endLines == null) endLines = [];
        endLines.push(`${pl(m.player)} 버스트`);
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
  playMode?: "local" | "online";
};

export function HandLog({
  logs,
  playerNames,
  showdownHoleCtx = null,
  playMode = "local",
}: HandLogProps) {
  const [open, setOpen] = React.useState(true);
  const recent = React.useMemo(() => logs.slice(-140), [logs]);
  const sections = React.useMemo(
    () => buildSections(recent, playerNames, showdownHoleCtx ?? null, playMode),
    [recent, playerNames, showdownHoleCtx, playMode],
  );
  const tail = sections.slice(-10);

  return (
    <details
      className="rounded-xl border border-zinc-600/90 bg-zinc-700/55 p-3"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="mb-0.5 cursor-pointer list-none text-xs font-semibold text-zinc-200 [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-2">
          핸드 로그
          <span className="rounded bg-zinc-600/60 px-1 py-px text-[9px] font-normal uppercase tracking-wide text-zinc-400">
            펼치기 · 접기
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
