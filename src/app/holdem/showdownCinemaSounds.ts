/**
 * Web Audio 간단 효과음 — 외부 에셋 없음. 실패 시 무시.
 */

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  try {
    return new Ctx();
  } catch {
    return null;
  }
}

let shared: AudioContext | null = null;
function ctx(): AudioContext | null {
  if (shared == null || shared.state === "closed") shared = getCtx();
  if (shared?.state === "suspended") {
    void shared.resume().catch(() => {});
  }
  return shared;
}

function beep(freq: number, duration: number, type: OscillatorType = "sine", vol = 0.06) {
  const c = ctx();
  if (!c) return;
  const t0 = c.currentTime;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.02);
  g.gain.linearRampToValueAtTime(0.001, t0 + duration);
  osc.connect(g);
  g.connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

/** 카드 공개 / 딜 느낌 */
export function playShowdownDealChirp() {
  beep(880, 0.06, "triangle", 0.055);
  window.setTimeout(() => beep(660, 0.05, "triangle", 0.045), 45);
}

/** 리버 직전 긴장 */
export function playShowdownRiverTension() {
  beep(220, 0.12, "sine", 0.07);
  window.setTimeout(() => beep(330, 0.14, "sine", 0.08), 90);
}

/** 결과 — 짧은 상승 주파수 */
export function playShowdownResultChime() {
  beep(523.25, 0.08, "sine", 0.065);
  window.setTimeout(() => beep(659.25, 0.09, "sine", 0.07), 75);
  window.setTimeout(() => beep(783.99, 0.1, "sine", 0.075), 160);
}
