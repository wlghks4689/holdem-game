import type { HoldemUiLocale } from "../holdemPrefs";

export type MessageKey =
  | "settings.title"
  | "settings.backHome"
  | "settings.intro"
  | "settings.nicknameLabel"
  | "settings.nicknameHint"
  | "settings.madeHandFx"
  | "settings.madeHandFxHint"
  | "settings.language"
  | "settings.languageKo"
  | "settings.languageEn"
  | "settings.languageNote"
  | "settings.sound"
  | "settings.soundHint"
  | "home.title"
  | "home.subtitle"
  | "home.settings"
  | "home.guide"
  | "home.guideDesc"
  | "home.feedback"
  | "home.multiplayTitle"
  | "home.multiplayDesc"
  | "home.singleTitle"
  | "home.singleDesc"
  | "home.settingsDesc"
  | "home.feedbackDesc"
  | "home.activeMatchTitle"
  | "home.activeMatchSeatHost"
  | "home.activeMatchSeatGuest"
  | "home.dismiss"
  | "home.rejoin"
  | "home.creatingRoom"
  | "home.createPrivate"
  | "home.createPrivateDesc"
  | "home.createPublic"
  | "home.createPublicDesc"
  | "home.browseRooms"
  | "home.browseRoomsDesc"
  | "rooms.title"
  | "rooms.empty"
  | "rooms.join"
  | "rooms.back"
  | "rooms.refresh"
  | "rooms.hostLabel"
  | "rooms.waiting"
  | "rooms.joiningRoom"
  | "rooms.joinError"
  | "rooms.createdAgo"
  | "common.player"
  | "hole.myCards"
  | "hole.opponent"
  | "hole.actionTurn"
  | "hole.handPick"
  | "hole.submitted"
  | "hole.pendingReveal"
  | "hole.pickWait"
  | "hole.iaLearnedPrefix"
  | "hole.iaOppCategory"
  | "hole.iaHidden"
  | "viewer.panelTitle"
  | "viewer.currentHand"
  | "action.fold"
  | "action.check"
  | "action.call"
  | "action.raise"
  | "action.bet"
  | "action.allInCall"
  | "action.matchEnd"
  | "action.winner"
  | "single.hellTitle"
  | "single.hellDesc"
  | "single.hellLockedHint";

const KO: Record<MessageKey, string> = {
  "settings.title": "환경 설정",
  "settings.backHome": "← 홈으로",
  "settings.intro":
    "닉네임·연출·언어는 이 브라우저에만 저장됩니다. 온라인 방에서는 아래 닉네임이 내 좌석 이름으로 쓰입니다.",
  "settings.nicknameLabel": "방 입장 시 닉네임",
  "settings.nicknameHint":
    "비워 두면 기본 이름이 사용됩니다. 싱글/온라인·내 좌석 표시에 적용됩니다.",
  "settings.madeHandFx": "메이드 핸드 연출 (스트레이트 이상)",
  "settings.madeHandFxHint":
    "카드 주변 하이라이트 애니메이션. 끄면 저사양·집중 모드에 적합합니다.",
  "settings.language": "게임 언어 (UI)",
  "settings.languageKo": "한국어",
  "settings.languageEn": "English",
  "settings.languageNote":
    "영어 선택 시 주요 화면·버튼·족보 이름이 영어로 표시됩니다. 일부 메시지·로그는 아직 한국어일 수 있습니다.",
  "settings.sound": "사운드 효과",
  "settings.soundHint": "(준비 중 — 옵션만 저장됩니다)",
  "home.title": "핸드 셀렉 홀덤",
  "home.subtitle": "헤즈업 · 핸드 셀렉",
  "home.settings": "환경 설정",
  "home.guide": "게임 설명",
  "home.guideDesc":
    "처음 하는 분도 이해할 수 있는 플레이 흐름 안내입니다.",
  "home.feedback": "의견 보내기",
  "home.multiplayTitle": "멀티플레이",
  "home.multiplayDesc": "방 만들기, 방 참여, 비공개 방 선택 가능",
  "home.singleTitle": "싱글플레이",
  "home.singleDesc": "AI를 상대로 핸드를 선택하고 더 많은 칩을 확보하세요.",
  "home.settingsDesc": "닉네임, 메이드 연출, 언어, 사운드.",
  "home.feedbackDesc":
    "버그 제보, 개선 아이디어, 게임 평가를 남겨 주세요.",
  "home.activeMatchTitle": "진행 중인 게임이 있습니다",
  "home.activeMatchSeatHost": "호스트",
  "home.activeMatchSeatGuest": "게스트",
  "home.dismiss": "무시",
  "home.rejoin": "돌아가기",
  "home.creatingRoom": "방 준비 중…",
  "home.createPrivate": "비공개 방 만들기",
  "home.createPrivateDesc": "초대 링크로만 입장 가능한 1:1 방을 만듭니다.",
  "home.createPublic": "공개 방 만들기",
  "home.createPublicDesc": "누구나 목록에서 찾아 입장할 수 있는 방을 만듭니다.",
  "home.browseRooms": "공개 방 참여",
  "home.browseRoomsDesc": "현재 대기 중인 공개 방 목록에서 골라 입장합니다.",
  "rooms.title": "공개 방 목록",
  "rooms.empty": "현재 대기 중인 공개 방이 없습니다.",
  "rooms.join": "참여",
  "rooms.back": "← 뒤로",
  "rooms.refresh": "새로고침",
  "rooms.hostLabel": "호스트",
  "rooms.waiting": "대기 중",
  "rooms.joiningRoom": "입장 중…",
  "rooms.joinError": "방에 입장할 수 없습니다.",
  "rooms.createdAgo": "전",
  "common.player": "플레이어",
  "hole.myCards": "내 카드",
  "hole.opponent": "상대",
  "hole.actionTurn": "액션 턴",
  "hole.handPick": "핸드 선택",
  "hole.submitted": "확정됨",
  "hole.pendingReveal": "제출됨 · 실제 카드는 상대 확정 후 공개",
  "hole.pickWait": "핸드 선택 대기 중",
  "hole.iaLearnedPrefix": "상대 IA로 공개된 내 카테고리:",
  "hole.iaOppCategory": "IA · 상대 카테고리:",
  "hole.iaHidden": "(실제 카드는 비공개)",
  "viewer.panelTitle": "현재 핸드 (내 카드 + 공개 보드)",
  "viewer.currentHand": "👉 현재 핸드:",
  "action.fold": "Fold",
  "action.check": "Check",
  "action.call": "Call",
  "action.raise": "Raise",
  "action.bet": "Bet",
  "action.allInCall": "All-in Call",
  "action.matchEnd": "매치 종료",
  "action.winner": "승자:",
  "single.hellTitle": "Hell",
  "single.hellDesc": "한계에 도전",
  "single.hellLockedHint":
    "Hard 매치 승리 10회로 잠금 해제 · 현재 진행도는 아래에 표시됩니다",
};

const EN: Record<MessageKey, string> = {
  "settings.title": "Settings",
  "settings.backHome": "← Home",
  "settings.intro":
    "Nickname, effects, and language are stored in this browser only. Online: the nickname is used as your seat label.",
  "settings.nicknameLabel": "Room nickname",
  "settings.nicknameHint":
    "Leave blank to use defaults. Applies to your seat in online & single-player.",
  "settings.madeHandFx": "Made-hand effects (straight+)",
  "settings.madeHandFxHint":
    "Card highlight animations. Turn off for low-end devices or focus mode.",
  "settings.language": "Game language (UI)",
  "settings.languageKo": "Korean",
  "settings.languageEn": "English",
  "settings.languageNote":
    "English applies to the game UI, controls, hand names, showdown results, and hand log.",
  "settings.sound": "Sound effects",
  "settings.soundHint": "(coming soon — preference is saved)",
  "home.title": "Hand Select Hold’em",
  "home.subtitle": "Heads-up · hand select",
  "home.settings": "Settings",
  "home.guide": "How to play",
  "home.guideDesc": "A quick walkthrough of how a hand flows.",
  "home.feedback": "Send feedback",
  "home.multiplayTitle": "Multiplayer",
  "home.multiplayDesc": "Create, join, or set up a private room",
  "home.singleTitle": "Single-player",
  "home.singleDesc": "Choose your hands against the AI and secure more chips.",
  "home.settingsDesc": "Nickname, made-hand FX, language, sound.",
  "home.feedbackDesc": "Bugs, ideas, and ratings welcome.",
  "home.activeMatchTitle": "You have a game in progress",
  "home.activeMatchSeatHost": "Host",
  "home.activeMatchSeatGuest": "Guest",
  "home.dismiss": "Dismiss",
  "home.rejoin": "Rejoin",
  "home.creatingRoom": "Preparing room…",
  "home.createPrivate": "Create Private Room",
  "home.createPrivateDesc": "Invite-only room — share the link with your opponent.",
  "home.createPublic": "Create Public Room",
  "home.createPublicDesc": "Open room that anyone can find and join from the list.",
  "home.browseRooms": "Browse Rooms",
  "home.browseRoomsDesc": "Find and join a public room that's waiting for players.",
  "rooms.title": "Public Rooms",
  "rooms.empty": "No public rooms available right now.",
  "rooms.join": "Join",
  "rooms.back": "← Back",
  "rooms.refresh": "Refresh",
  "rooms.hostLabel": "Host",
  "rooms.waiting": "Waiting",
  "rooms.joiningRoom": "Joining…",
  "rooms.joinError": "Could not join the room.",
  "rooms.createdAgo": "ago",
  "common.player": "Player",
  "hole.myCards": "Hero",
  "hole.opponent": "Villain",
  "hole.actionTurn": "Your action",
  "hole.handPick": "Pick hand",
  "hole.submitted": "Locked in",
  "hole.pendingReveal":
    "Submitted · cards reveal after opponent locks in",
  "hole.pickWait": "Waiting for hand pick",
  "hole.iaLearnedPrefix": "Category you revealed to opponent IA:",
  "hole.iaOppCategory": "IA · opponent category:",
  "hole.iaHidden": "(Hole cards hidden)",
  "viewer.panelTitle": "Current hand (your cards + board)",
  "viewer.currentHand": "👉 Current hand:",
  "action.fold": "Fold",
  "action.check": "Check",
  "action.call": "Call",
  "action.raise": "Raise",
  "action.bet": "Bet",
  "action.allInCall": "All-in call",
  "action.matchEnd": "Match over",
  "action.winner": "Winner:",
  "single.hellTitle": "Hell",
  "single.hellDesc": "Challenge yourself — show what you've got",
  "single.hellLockedHint":
    "Unlock by winning 10 Hard matches — progress shown below",
};

const MAP: Record<HoldemUiLocale, Record<MessageKey, string>> = {
  ko: KO,
  en: EN,
};

export function message(
  locale: HoldemUiLocale,
  key: MessageKey,
): string {
  return MAP[locale][key] ?? MAP.ko[key] ?? key;
}
