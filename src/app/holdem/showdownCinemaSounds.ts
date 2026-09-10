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

/** ALL-IN 확정 순간의 저음 충격과 짧은 이중 박동. */
export function playAllInImpact() {
  beep(92, 0.24, "sawtooth", 0.085);
  beep(184, 0.12, "triangle", 0.055);
  window.setTimeout(() => beep(76, 0.2, "sine", 0.075), 170);
}

/** 다음 스트리트가 열리기 전의 예고음. 리버로 갈수록 길고 높아집니다. */
export function playShowdownStreetWindup(
  street: "flop" | "turn" | "river",
) {
  if (street === "flop") {
    beep(146.83, 0.12, "sine", 0.045);
    window.setTimeout(() => beep(196, 0.1, "triangle", 0.04), 180);
    return;
  }
  if (street === "turn") {
    beep(130.81, 0.16, "sine", 0.055);
    window.setTimeout(() => beep(220, 0.14, "triangle", 0.05), 250);
    return;
  }
  playShowdownRiverTension();
  window.setTimeout(() => beep(440, 0.18, "sine", 0.065), 390);
}

/** 시네마틱 보드 카드 착지음. 턴·리버는 더 무겁게 구분합니다. */
export function playShowdownBoardReveal(
  street: "flop" | "turn" | "river",
) {
  if (street === "flop") {
    playShowdownDealChirp();
    return;
  }
  if (street === "turn") {
    beep(620, 0.075, "triangle", 0.065);
    window.setTimeout(() => beep(310, 0.09, "sine", 0.055), 55);
    return;
  }
  beep(740, 0.09, "triangle", 0.075);
  window.setTimeout(() => beep(370, 0.13, "sine", 0.07), 65);
  window.setTimeout(() => beep(185, 0.16, "sine", 0.055), 130);
}

/** 카드 공개 / 딜 느낌 */
export function playShowdownDealChirp() {
  beep(880, 0.06, "triangle", 0.055);
  window.setTimeout(() => beep(660, 0.05, "triangle", 0.045), 45);
}

/** 커뮤니티 카드가 보드에 깔릴 때: 짧은 사사삭 느낌 */
export function playBoardDealSoft() {
  beep(410, 0.045, "triangle", 0.038);
  window.setTimeout(() => beep(330, 0.04, "triangle", 0.032), 38);
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

/** 상대 콜 — 낮은 단음 */
export function playBettingCallSound() {
  beep(493.88, 0.075, "sine", 0.052);
}

/** 상대 레이즈·베팅·공격적 액션 — 짧은 이중 상승 */
export function playBettingRaiseSound(level: 1 | 2 | 3 | 4 | 5 = 2) {
  const volume = 0.045 + level * 0.007;
  const low = level >= 4 ? 123.47 : level >= 3 ? 185 : 369.99;
  beep(low, 0.07 + level * 0.015, level >= 4 ? "sawtooth" : "triangle", volume);
  window.setTimeout(
    () => beep(440 + level * 62, 0.07 + level * 0.012, "triangle", volume + 0.006),
    52,
  );
  if (level >= 3) {
    window.setTimeout(
      () => beep(554.37 + level * 55, 0.09 + level * 0.01, "sine", volume + 0.004),
      128,
    );
  }
  if (level >= 5) {
    window.setTimeout(() => beep(82.41, 0.22, "sine", 0.078), 185);
  }
}

/** 상대 체크 — 아주 짧게 */
export function playBettingCheckSound() {
  beep(440, 0.045, "sine", 0.038);
}

/** IA 사용 */
export function playBettingIASound() {
  beep(698.46, 0.085, "sine", 0.058);
}

/** 내 액션 — 살짝 낮은 볼륨으로 구분 */
export function playHeroCallSound() {
  beep(523.25, 0.07, "sine", 0.036);
}

export function playHeroRaiseSound(level: 1 | 2 | 3 | 4 | 5 = 2) {
  const volume = 0.028 + level * 0.004;
  const low = level >= 4 ? 146.83 : level >= 3 ? 220 : 415.3;
  beep(low, 0.06 + level * 0.012, level >= 4 ? "sawtooth" : "triangle", volume);
  window.setTimeout(
    () => beep(500 + level * 61, 0.07 + level * 0.01, "triangle", volume + 0.004),
    52,
  );
  if (level >= 3) {
    window.setTimeout(
      () => beep(659.25 + level * 42, 0.085 + level * 0.008, "sine", volume + 0.003),
      124,
    );
  }
  if (level >= 5) {
    window.setTimeout(() => beep(98, 0.2, "sine", 0.052), 180);
  }
}

export function playHeroCheckSound() {
  beep(523.25, 0.04, "sine", 0.028);
}

export function playHeroIASound() {
  beep(783.99, 0.08, "sine", 0.04);
}
