import { CHIPS_PER_BB } from "./constants";

/**
 * UI용 "Xbb" 문자열. `oneBbInChips` = 이번 표기 기준 1BB에 해당하는 칩 수(보통 `handBlinds.bb`).
 */
export function chipsAsBbLabel(
  chips: number,
  oneBbInChips: number = CHIPS_PER_BB,
): string {
  const unit = oneBbInChips > 1e-9 ? oneBbInChips : CHIPS_PER_BB;
  const bb = chips / unit;
  if (Math.abs(bb - Math.round(bb)) < 1e-9) return `${Math.round(bb)}bb`;
  const s = bb.toFixed(1).replace(/\.0$/, "");
  return `${s}bb`;
}
