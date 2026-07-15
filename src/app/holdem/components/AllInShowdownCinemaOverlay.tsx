"use client";

import type { AllInCinemaStreet } from "../allInCinemaTimeline";
import type { AllInCinemaPhase } from "../hooks/useAllInShowdownCinema";

export type AllInShowdownCinemaOverlayProps = {
  phase: AllInCinemaPhase;
  activeStreet: AllInCinemaStreet | null;
  visualRevealed: number;
  isEn: boolean;
  subtleMotion: boolean;
  onSkip: () => void;
};

const STREET_LABELS: Record<
  AllInCinemaStreet,
  { en: string; ko: string }
> = {
  flop: { en: "FLOP", ko: "플랍" },
  turn: { en: "TURN", ko: "턴" },
  river: { en: "RIVER", ko: "리버" },
};

export function AllInShowdownCinemaOverlay({
  phase,
  activeStreet,
  visualRevealed,
  isEn,
  subtleMotion,
  onSkip,
}: AllInShowdownCinemaOverlayProps) {
  if (phase === "off" || phase === "showdown-resolve") return null;

  const impact = phase === "allin-lock";
  const streetLabel = activeStreet
    ? STREET_LABELS[activeStreet][isEn ? "en" : "ko"]
    : "RUNOUT";
  const title = impact ? "ALL-IN" : streetLabel;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[60] overflow-hidden"
      data-cinema-overlay-phase={phase}
      data-cinema-street={activeStreet ?? "none"}
      aria-live="polite"
      aria-label={isEn ? "All-in showdown presentation" : "올인 쇼다운 연출"}
    >
      <div
        className={[
          "holdem-allin-vignette absolute inset-0",
          impact ? "holdem-allin-vignette-impact" : "",
          activeStreet ? `holdem-allin-vignette-${activeStreet}` : "",
          subtleMotion ? "holdem-allin-vignette-subtle" : "",
        ].join(" ")}
        aria-hidden
      />
      <div className="holdem-allin-scanlines absolute inset-0 opacity-30" aria-hidden />
      {!subtleMotion ? (
        <>
          <div className="holdem-allin-edge-flash absolute inset-x-0 top-0 h-px" aria-hidden />
          <div className="holdem-allin-edge-flash absolute inset-x-0 bottom-0 h-px" aria-hidden />
        </>
      ) : null}

      <div className="absolute inset-x-0 top-[max(3.5rem,8vh)] flex justify-center px-4 sm:top-[max(4rem,9vh)]">
        <div
          key={`${phase}-${activeStreet ?? "impact"}-${visualRevealed}`}
          className={[
            "text-center",
            impact ? "holdem-allin-impact-title" : "holdem-allin-phase-title",
          ].join(" ")}
        >
          {impact ? (
            <div className="inline-flex items-center gap-2 rounded-full border border-rose-300/65 bg-rose-950/75 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-rose-100 shadow-[0_0_28px_rgba(244,63,94,0.32)] backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-300 shadow-[0_0_10px_rgba(253,164,175,0.9)]" />
              ALL-IN RUNOUT
            </div>
          ) : null}
          <p
            className={[
              "mt-3 font-black uppercase text-amber-100",
              impact
                ? "text-4xl tracking-[0.22em] drop-shadow-[0_0_34px_rgba(251,191,36,0.7)] sm:text-6xl"
                : activeStreet === "river"
                  ? "text-3xl tracking-[0.28em] drop-shadow-[0_0_30px_rgba(251,113,133,0.72)] sm:text-5xl"
                  : "text-2xl tracking-[0.26em] drop-shadow-[0_0_24px_rgba(251,191,36,0.48)] sm:text-4xl",
            ].join(" ")}
          >
            {title}
          </p>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-5 flex justify-center px-4 sm:bottom-7">
        <button
          type="button"
          onClick={onSkip}
          className="pointer-events-auto rounded-full border border-zinc-500/75 bg-zinc-950/80 px-4 py-1.5 text-[11px] font-semibold text-zinc-200 shadow-lg backdrop-blur transition hover:border-amber-300/75 hover:text-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
        >
          {isEn ? "Skip animation" : "연출 건너뛰기"}
        </button>
      </div>
    </div>
  );
}
