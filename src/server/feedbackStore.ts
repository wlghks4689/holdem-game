/**
 * 피드백 서버 사이드 스토어
 * - 개발 환경: globalThis 메모리 (핫 리로드 생존)
 * - 프로덕션: 동일 메모리 (서버리스 재시작 시 초기화 — 추후 KV 연동 가능)
 */

export type FeedbackEntry = {
  id: string;
  nickname: string;
  message: string;
  rating: number | null; // 1-5 or null
  createdAt: number; // Unix ms
};

const globalRef = globalThis as unknown as {
  __holdemFeedback?: FeedbackEntry[];
};
if (!globalRef.__holdemFeedback) {
  globalRef.__holdemFeedback = [];
}
const store = globalRef.__holdemFeedback;

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function saveFeedback(
  nickname: string,
  message: string,
  rating: number | null,
): FeedbackEntry {
  const entry: FeedbackEntry = {
    id: uid(),
    nickname: nickname.trim().slice(0, 40) || "익명",
    message: message.trim().slice(0, 2000),
    rating,
    createdAt: Date.now(),
  };
  store.push(entry);
  // 최대 500개 유지
  if (store.length > 500) store.splice(0, store.length - 500);
  return entry;
}

export function getAllFeedback(): FeedbackEntry[] {
  return [...store].sort((a, b) => b.createdAt - a.createdAt);
}

export function getFeedbackCount(): number {
  return store.length;
}
