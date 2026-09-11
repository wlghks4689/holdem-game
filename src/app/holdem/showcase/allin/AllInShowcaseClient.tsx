"use client";

import * as React from "react";
import { HoldemPlayUI } from "../../HoldemPlayUI";
import { createInitialGameState } from "@/holdem/gameReducer";
import type {
  GameMessage,
  GameState,
  PlayerIndex,
  SelectedHand,
} from "@/holdem/types";

const HERO: SelectedHand = {
  templateId: "hi_KK",
  hole: [
    { rank: 13, suit: "c" },
    { rank: 13, suit: "h" },
  ],
  iaCategory: "하이파켓",
  acquisitionType: "selected",
  selectedHandKey: "KK",
};

const OPPONENT: SelectedHand = {
  templateId: "hi_AA",
  hole: [
    { rank: 14, suit: "s" },
    { rank: 14, suit: "h" },
  ],
  iaCategory: "하이파켓",
  acquisitionType: "selected",
  selectedHandKey: "AA",
};

const BOARD = [
  { rank: 14, suit: "d" as const },
  { rank: 13, suit: "s" as const },
  { rank: 8, suit: "c" as const },
  { rank: 2, suit: "d" as const },
  { rank: 13, suit: "d" as const },
];

type Beat = {
  at: number;
  patch: Partial<GameState>;
};

type ShowcaseStreet = "preflop" | "flop" | "turn" | "river";

const STREET_REVEALED: Record<ShowcaseStreet, number> = {
  preflop: 0,
  flop: 3,
  turn: 4,
  river: 5,
};

function isShowcaseStreet(value: string | null): value is ShowcaseStreet {
  return value !== null && value in STREET_REVEALED;
}

function scenarioActionLogs(street: ShowcaseStreet): GameMessage[] {
  const actionType = street === "preflop" ? "preflop_action" : "postflop_action";
  return [
    ...PREFLOP_LOGS,
    { t: actionType, player: 0, action: "올인", amount: 200 },
    { t: actionType, player: 1, action: "콜", amount: 200 },
  ];
}

function baseState(): GameState {
  const state = createInitialGameState("classic", "deep");
  return {
    ...state,
    phase: "preflop",
    roundNumber: 1,
    handBlinds: { sb: 0.5, bb: 1, ante: 1 },
    button: 0,
    chips: [198.5, 198],
    handStartChips: [200, 200],
    pot: 3.5,
    holes: [HERO, OPPONENT],
    board: BOARD,
    boardRevealed: 0,
    handSelectPhase: "done",
    preflopStage: "button_acts",
    betting: {
      contributed: [0.5, 1],
      currentLevel: 1,
      raiseDone: false,
      checksThisStreet: 0,
      raisesThisStreet: 0,
    },
    toAct: 0,
    lastActionNote: "블라인드 포스팅 · 액션 시작",
    logs: [{ t: "round_start", round: 1 }],
  };
}

function scenarioState(street: ShowcaseStreet): GameState {
  const startRevealed = STREET_REVEALED[street];
  return {
    ...baseState(),
    phase: street,
    chips: [0, 0],
    pot: 400,
    boardRevealed: startRevealed,
    betting: {
      contributed: [200, 200],
      currentLevel: 200,
      raiseDone: false,
      checksThisStreet: 0,
      raisesThisStreet: 1,
    },
    toAct: null,
    isAllIn: true,
    preflopStage: street === "preflop" ? "facing_raise" : null,
    lastActionNote: `Pro · 콜 · ${street.toUpperCase()} 올인`,
    logs: scenarioActionLogs(street),
  };
}

function scenarioBeat(street: ShowcaseStreet): Beat {
  return {
    at: 1_200,
    patch: {
      chips: [400, 0],
      pot: 0,
      potAwardFlash: [400, -400],
      phase: "showdown",
      boardRevealed: 5,
      runoutUiStartRevealed: STREET_REVEALED[street],
      toAct: null,
      isAllIn: false,
      winner: 0,
      handEndMode: "showdown",
      lastActionNote: "K 쿼즈 vs A 풀하우스",
    },
  };
}

const BEATS: Beat[] = [
  {
    at: 1_700,
    patch: {
      chips: [197.5, 198],
      pot: 4.5,
      betting: {
        contributed: [1.5, 1],
        currentLevel: 1.5,
        raiseDone: false,
        checksThisStreet: 0,
        raisesThisStreet: 1,
      },
      toAct: 1,
      preflopStage: "facing_raise",
      lastActionNote: "빌런 · 레이즈 → 총 2.5bb",
    },
  },
  {
    at: 3_500,
    patch: {
      chips: [197.5, 192],
      pot: 10.5,
      betting: {
        contributed: [1.5, 7],
        currentLevel: 7,
        raiseDone: false,
        checksThisStreet: 0,
        raisesThisStreet: 2,
      },
      toAct: 0,
      lastActionNote: "Pro · 3BET → 총 8bb",
    },
  },
  {
    at: 5_300,
    patch: {
      chips: [179.5, 192],
      pot: 28.5,
      betting: {
        contributed: [19.5, 7],
        currentLevel: 19.5,
        raiseDone: false,
        checksThisStreet: 0,
        raisesThisStreet: 3,
      },
      toAct: 1,
      lastActionNote: "빌런 · 4BET → 총 20bb",
    },
  },
  {
    at: 7_100,
    patch: {
      chips: [179.5, 179.5],
      pot: 41,
      betting: {
        contributed: [19.5, 19.5],
        currentLevel: 19.5,
        raiseDone: false,
        checksThisStreet: 0,
        raisesThisStreet: 3,
      },
      toAct: 1,
      lastActionNote: "Pro · 콜 · 4BET 팟",
    },
  },
  {
    at: 8_900,
    patch: {
      phase: "flop",
      boardRevealed: 3,
      betting: {
        contributed: [0, 0],
        currentLevel: 0,
        raiseDone: false,
        checksThisStreet: 0,
        raisesThisStreet: 0,
      },
      toAct: 1,
      preflopStage: null,
      lastActionNote: "플랍 · A K 8",
    },
  },
  {
    at: 10_900,
    patch: {
      chips: [179.5, 159.5],
      pot: 61,
      betting: {
        contributed: [0, 20],
        currentLevel: 20,
        raiseDone: false,
        checksThisStreet: 0,
        raisesThisStreet: 0,
      },
      toAct: 0,
      lastActionNote: "Pro · 베팅 → 20bb",
    },
  },
  {
    at: 13_000,
    patch: {
      chips: [0, 159.5],
      pot: 240.5,
      betting: {
        contributed: [179.5, 20],
        currentLevel: 179.5,
        raiseDone: false,
        checksThisStreet: 0,
        raisesThisStreet: 1,
      },
      toAct: 1,
      isAllIn: true,
      lastActionNote: "빌런 · 레이즈 올인 → 총 179.5bb",
    },
  },
  {
    at: 15_200,
    patch: {
      chips: [400, 0],
      pot: 0,
      potAwardFlash: [400, -400],
      phase: "showdown",
      boardRevealed: 5,
      runoutUiStartRevealed: 3,
      betting: {
        contributed: [179.5, 179.5],
        currentLevel: 179.5,
        raiseDone: false,
        checksThisStreet: 0,
        raisesThisStreet: 1,
      },
      toAct: null,
      isAllIn: false,
      winner: 0,
      handEndMode: "showdown",
      lastActionNote: "K 쿼즈 vs A 풀하우스",
    },
  },
];

const PREFLOP_LOGS: GameMessage[] = [
  { t: "round_start", round: 1 },
  { t: "preflop_action", player: 0, action: "raise", amount: 2.5 },
  { t: "preflop_action", player: 1, action: "3bet", amount: 8 },
  { t: "preflop_action", player: 0, action: "4bet", amount: 20 },
  { t: "preflop_action", player: 1, action: "call", amount: 20 },
];

const SHOWDOWN_LOG: GameMessage = {
  t: "showdown",
  winners: [0],
  pot: 400,
  desc: "K 쿼즈 vs A 풀하우스",
  hands: ["K 쿼즈", "A 풀하우스"],
};

export function AllInShowcaseClient({
  initialViewer = 0,
}: {
  initialViewer?: PlayerIndex;
}) {
  const [run, setRun] = React.useState(0);
  const scenarioStreet = React.useMemo<ShowcaseStreet | null>(() => {
    if (typeof window === "undefined") return null;
    const street = new URLSearchParams(window.location.search).get("street");
    return isShowcaseStreet(street) ? street : null;
  }, []);
  const [state, setState] = React.useState<GameState>(() => baseState());

  const start = React.useCallback(() => {
    setRun((value) => value + 1);
  }, []);

  React.useEffect(() => {
    const initial = scenarioStreet ? scenarioState(scenarioStreet) : baseState();
    setState(initial);
    if (run === 0) return;

    const beats = scenarioStreet ? [scenarioBeat(scenarioStreet)] : BEATS;
    const timers = beats.map((beat, index) =>
      window.setTimeout(() => {
        setState((current) => {
          const logs =
            scenarioStreet
              ? [...scenarioActionLogs(scenarioStreet), SHOWDOWN_LOG]
              : index >= 7
                ? [...PREFLOP_LOGS, SHOWDOWN_LOG]
              : index >= 3
                ? PREFLOP_LOGS
                : current.logs;
          return { ...current, ...beat.patch, logs };
        });
      }, beat.at),
    );
    return () => timers.forEach(window.clearTimeout);
  }, [run, scenarioStreet]);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("autoplay") !== "1") return;
    const timer = window.setTimeout(start, 1_200);
    return () => window.clearTimeout(timer);
  }, [start]);

  return (
    <main className="min-h-screen bg-zinc-900 px-8 py-4 text-zinc-50">
      <style>{`
        button[title^="개발 전용"],
        nextjs-portal {
          display: none !important;
        }
      `}</style>
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-400">
              Hand Select Hold&apos;em
            </p>
            <h1 className="text-2xl font-black">4BET ALL-IN SHOWDOWN</h1>
          </div>
          {run === 0 ? (
            <button
              type="button"
              onClick={start}
              className="rounded-lg border border-amber-500 bg-amber-950/70 px-5 py-2 text-sm font-bold text-amber-100"
            >
              연출 시작
            </button>
          ) : null}
        </div>
        <HoldemPlayUI
          state={state}
          dispatch={() => undefined}
          actionTimerSecondsLeft={null}
          viewer={initialViewer}
          playerNames={["빌런", "Pro"]}
          updateName={() => undefined}
          mySeat={initialViewer}
          playMode="single"
          singleDifficulty="hard"
        />
      </div>
    </main>
  );
}
