import assert from "node:assert/strict";
import type { Card } from "../src/holdem/cards";
import { handValueDisplayForLocale } from "../src/holdem/pokerEval";
import {
  buildShowdownResultPresentation,
  currentShowdownHandLabels,
} from "../src/app/holdem/showdownPresentation";

const c = (rank: number, suit: Card["suit"]): Card => ({ rank, suit });

const tie = buildShowdownResultPresentation(
  [
    [c(2, "h"), c(3, "d")],
    [c(4, "h"), c(5, "d")],
  ],
  [c(10, "s"), c(11, "s"), c(12, "s"), c(13, "s"), c(14, "s")],
  "ko",
);
assert.equal(tie.split, true);
assert.equal(tie.winner, null);
assert.equal(tie.labels[0], tie.labels[1]);

const winner = buildShowdownResultPresentation(
  [
    [c(14, "s"), c(14, "h")],
    [c(13, "s"), c(13, "h")],
  ],
  [c(2, "c"), c(5, "d"), c(9, "h"), c(11, "s"), c(12, "c")],
  "ko",
);
assert.equal(winner.split, false);
assert.equal(winner.winner, 0);
assert.notEqual(winner.labels[0], winner.labels[1]);

const changingHoles: [[Card, Card], [Card, Card]] = [
  [c(8, "s"), c(8, "h")],
  [c(14, "d"), c(13, "d")],
];
const changingBoard = [
  c(10, "c"),
  c(10, "d"),
  c(2, "s"),
  c(8, "d"),
  c(14, "c"),
];
assert.deepEqual(
  currentShowdownHandLabels(changingHoles, changingBoard, 0, "ko"),
  [null, null],
);
const flopLabels = currentShowdownHandLabels(
  changingHoles,
  changingBoard,
  3,
  "ko",
);
const turnLabels = currentShowdownHandLabels(
  changingHoles,
  changingBoard,
  4,
  "ko",
);
const riverLabels = currentShowdownHandLabels(
  changingHoles,
  changingBoard,
  5,
  "ko",
);
assert.ok(flopLabels[0] && flopLabels[1]);
assert.ok(turnLabels[0] && turnLabels[1]);
assert.ok(riverLabels[0] && riverLabels[1]);
assert.notEqual(flopLabels[0], turnLabels[0]);

const twoPairValue = { rank: 3, kickers: [12, 11, 14] };
assert.equal(
  handValueDisplayForLocale(twoPairValue, "en"),
  "Two pair, Qs and Js",
);
assert.equal(
  handValueDisplayForLocale(twoPairValue, "ko"),
  "Q, J 투페어",
);

console.log("Showdown result, street labels, and tie verification passed.");
