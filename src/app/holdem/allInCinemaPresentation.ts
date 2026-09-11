import type { AllInCinemaStreet } from "./allInCinemaTimeline";

const STREET_LABELS: Record<
  AllInCinemaStreet,
  { en: string; ko: string }
> = {
  flop: { en: "FLOP", ko: "플랍" },
  turn: { en: "TURN", ko: "턴" },
  river: { en: "RIVER", ko: "리버" },
};

/** 런아웃 준비 구간은 별도 문구 없이 SHOWDOWN 팝업을 유지한다. */
export function allInCinemaAnnouncementTitle(
  activeStreet: AllInCinemaStreet | null,
  isEn: boolean,
): string {
  return activeStreet
    ? STREET_LABELS[activeStreet][isEn ? "en" : "ko"]
    : "SHOWDOWN";
}
