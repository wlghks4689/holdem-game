"use client";

import * as React from "react";
import type { Card } from "@/holdem/cards";
import { PlayingCard } from "@/app/holdem/components/Card";
import {
  MADE_FX_CARD_GLOW,
  MADE_FX_CYCLE_AURA_CLASS,
  MADE_FX_IMPACT_CLASS,
  MADE_FX_VARIANT_CLASSES,
} from "@/app/holdem/components/HoleCards";
import { shouldPlayMadeHandBurst } from "@/app/holdem/madeHandFxPresentation";
import { HOLDEM_PREFS_CHANGED_EVENT, loadMadeHandFxEnabled } from "@/holdem/holdemPrefs";
import {
  handValueDisplayPatternKorean,
  madeHandFxKind,
  madeHandFxTier,
} from "@/holdem/pokerEval";
import type { MadeHandFxKind } from "@/holdem/pokerEval";
import { computeBestHandForPlayer } from "@/mysteryHoldem/showdown";
import type { PlayerState } from "@/mysteryHoldem/types";

/**
 * MysteryHoldem의 메이드 연출 계산.
 *
 * 게임 화면과 연출 테스트 화면(/mystery-holdem/fx-lab)이 **같은 코드**를 쓰도록 떼어냈다.
 * 테스트 화면이 연출을 따로 구현하면, 거기서 멀쩡해 보여도 게임에서는 다르게 나올 수 있다.
 */

/** 기존 홀덤(§25 공용 모듈)의 메이드 연출 설정을 그대로 공유한다 */
export function useMadeHandFxEnabled(): boolean {
  const [on, setOn] = React.useState(() => (typeof window !== "undefined" ? loadMadeHandFxEnabled() : true));
  React.useEffect(() => {
    setOn(loadMadeHandFxEnabled());
    const handler = () => setOn(loadMadeHandFxEnabled());
    window.addEventListener(HOLDEM_PREFS_CHANGED_EVENT, handler);
    return () => window.removeEventListener(HOLDEM_PREFS_CHANGED_EVENT, handler);
  }, []);
  return on;
}

export interface HeroMadeFx {
  tier: number;
  kind: MadeHandFxKind;
  label: string;
  cardClass: string;
  labelClass: string;
  outerFxClass: string;
  cycleAuraClass: string | undefined;
  showBurst: boolean;
  replayKey: string;
}

export const NO_MADE_FX: HeroMadeFx = {
  tier: 0,
  kind: "none",
  label: "",
  cardClass: "",
  labelClass: "",
  outerFxClass: "",
  cycleAuraClass: undefined,
  showBurst: false,
  replayKey: "no-fx",
};

/**
 * 한 플레이어의 현재 족보로 메이드 연출 설정을 만든다(§25 공용 모듈 재사용).
 *
 * 히어로의 진행 중 연출과 쇼다운에서의 상대 공개 연출이 같은 계산을 쓰도록 순수 함수로
 * 분리했다. 다른 점은 "언제 부르는가"뿐이다 — 상대 것은 카드가 실제로 공개되는 순간에만
 * 계산해야 한다. 플레이 중에 상대 좌석에 연출이 뜨면 비공개여야 할 패가 새어 나간다.
 */
export function buildMadeFx(
  enabled: boolean,
  player: PlayerState,
  board: Card[],
  keyPrefix: string,
): HeroMadeFx {
  if (!enabled || player.holeCards.length === 0) return NO_MADE_FX;
  const value = computeBestHandForPlayer(player, board);
  const tier = madeHandFxTier(value);
  if (tier <= 0) return NO_MADE_FX;
  const kind = madeHandFxKind(value);
  const variant = MADE_FX_VARIANT_CLASSES[kind];
  const cardClass = variant?.card ?? MADE_FX_CARD_GLOW[tier] ?? "";
  const labelClass = variant?.label ?? `holdem-made-hand-label-t${tier}`;
  const impactClass = MADE_FX_IMPACT_CLASS[kind] ?? "";
  const outerFxClass = ["holdem-made-fx", `holdem-made-fx-t${tier}`, "overflow-visible", impactClass, variant?.fx ?? ""]
    .filter(Boolean)
    .join(" ");
  const showBurst = shouldPlayMadeHandBurst({
    madeFxTier: tier,
    showdownReveal: false,
    showdownResultGlow: false,
    showdownRunoutFx: false,
  });
  return {
    tier,
    kind,
    label: handValueDisplayPatternKorean(value),
    cardClass,
    labelClass,
    outerFxClass,
    cycleAuraClass: MADE_FX_CYCLE_AURA_CLASS[kind],
    showBurst,
    // 같은 라운드에서 족보 종류가 유지되는 동안은 재마운트하지 않고, 실제로 족보가
    // 바뀔 때만(예: 트립스→풀하우스) 새 키를 받아 연출을 다시 재생한다.
    replayKey: `${keyPrefix}-${kind}`,
  };
}

export function HeroCardsWithMadeFx({
  cards,
  size,
  fx,
}: {
  cards: Card[];
  size: "board" | "hero";
  fx: HeroMadeFx;
}) {
  if (fx.tier <= 0) {
    return (
      <div className="flex gap-1.5">
        {cards.map((c, i) => (
          <PlayingCard key={i} card={c} size={size} />
        ))}
      </div>
    );
  }
  return (
    <div key={fx.replayKey} className={["mystery-hole-fx-bounds", fx.outerFxClass].join(" ")}>
      {fx.showBurst && fx.cycleAuraClass ? (
        <span className={`holdem-preview-cycle-aura ${fx.cycleAuraClass}`} aria-hidden />
      ) : null}
      <div className="flex gap-1.5 holdem-made-fx-stack">
        {cards.map((c, i) => (
          <div
            key={i}
            className={fx.showBurst ? "holdem-made-fx-card" : undefined}
            style={fx.showBurst ? { animationDelay: `${i * 0.08}s` } : undefined}
          >
            <PlayingCard card={c} size={size} className={fx.cardClass} />
          </div>
        ))}
      </div>
      {size === "hero" ? (
        <p className={["holdem-made-hand-copy mt-1 text-center text-xs font-extrabold tracking-tight", fx.labelClass].join(" ")}>
          {fx.label}
        </p>
      ) : null}
    </div>
  );
}
