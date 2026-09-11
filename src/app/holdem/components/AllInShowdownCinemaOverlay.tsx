"use client";

import type { AllInCinemaStreet } from "../allInCinemaTimeline";
import { allInCinemaAnnouncementTitle } from "../allInCinemaPresentation";
import type { AllInCinemaPhase } from "../hooks/useAllInShowdownCinema";

export type AllInShowdownCinemaOverlayProps = {
  phase: AllInCinemaPhase;
  activeStreet: AllInCinemaStreet | null;
  visualRevealed: number;
  isEn: boolean;
  subtleMotion: boolean;
};

export function AllInShowdownCinemaOverlay({
  phase,
  activeStreet,
  visualRevealed,
  isEn,
  subtleMotion,
}: AllInShowdownCinemaOverlayProps) {
  if (phase === "off" || phase === "showdown-resolve") return null;

  const impact = activeStreet == null;
  const title = allInCinemaAnnouncementTitle(activeStreet, isEn);

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-[60] cursor-wait overflow-hidden"
      data-cinema-overlay-phase={phase}
      data-cinema-street={activeStreet ?? "none"}
      data-cinema-revealed={visualRevealed}
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

      <div className="absolute inset-x-0 top-[max(0.75rem,2vh)] flex justify-center px-3 sm:top-[max(1rem,3vh)] sm:px-4">
        <div
          key={`cinema-announcement-${title}`}
          className={[
            "holdem-allin-announcement relative overflow-hidden rounded-2xl border px-5 py-3 text-center backdrop-blur-md sm:rounded-3xl sm:px-10 sm:py-4",
            impact ? "holdem-allin-impact-title" : "holdem-allin-phase-title",
            activeStreet ? `holdem-allin-announcement-${activeStreet}` : "",
          ].join(" ")}
        >
          {impact ? (
            <div className="inline-flex items-center gap-2 rounded-full border border-rose-300/65 bg-rose-950/75 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-rose-100 shadow-[0_0_28px_rgba(244,63,94,0.32)]">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-300 shadow-[0_0_10px_rgba(253,164,175,0.9)]" />
              {isEn ? "ALL-IN · CARDS UP" : "ALL-IN · 패 공개"}
            </div>
          ) : null}
          <p
            className={[
              "font-black uppercase leading-none text-amber-100",
              impact ? "mt-2" : "",
              impact
                ? "text-[clamp(2.5rem,11vw,5.25rem)] tracking-[0.1em] drop-shadow-[0_0_38px_rgba(251,191,36,0.78)]"
                : activeStreet === "river"
                  ? "text-[clamp(2.75rem,13vw,5.5rem)] tracking-[0.16em] drop-shadow-[0_0_38px_rgba(251,113,133,0.82)]"
                  : "text-[clamp(2.75rem,13vw,5.25rem)] tracking-[0.16em] drop-shadow-[0_0_34px_rgba(251,191,36,0.68)]",
            ].join(" ")}
          >
            {title}
          </p>
        </div>
      </div>
    </div>
  );
}
