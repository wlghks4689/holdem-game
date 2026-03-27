import { CHIPS_PER_BB } from "./constants";

/** UI용 BB 문자열 (칩 수 / CHIPS_PER_BB) */
export function chipsAsBbLabel(chips: number): string {
  const bb = chips / CHIPS_PER_BB;
  if (Number.isInteger(bb)) return `${bb}bb`;
  const s = bb.toFixed(1).replace(/\.0$/, "");
  return `${s}bb`;
}
