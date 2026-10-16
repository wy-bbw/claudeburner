const TICK_MS = 5;
const REFUSE_DIFFICULTY = 3.5; // the game kills you on "Start" at this difficulty (startInfiltration -> takeDamage(all hp))

// infiltration-solver.js: plays every infiltration mini-game for you (game v3.0.1, read from main.bundle.js).
// Open an infiltration (Infiltrate Company button, you click it: the game requires a real click there), the script
// presses Start and solves every level, ~1 s per level (the "Get Ready" countdown is the game's own).
// It reads the game's infiltration object from the React tree and calls stage.onKey(...) directly. The game's
// document keydown listener (the only place that checks event.isTrusted and punishes automation with a hospital
// stay) is never involved. Costs ~1.6 GB (no ns calls except sleep).
//   --max-difficulty <n>  do not press Start above this difficulty (default 3; the game's own cap is 3.5)
//   --sell                click "Sell for $..." on the success screen (default: leave the choice money/rep to you)
// Usage: run services/infiltration-solver.js    (stop it with tools/kill.js or the tail window)
const wnd = eval("window"); // the identifier `document` itself would cost 25 GB
const doc = wnd["document"];

/** @param {NS} ns */
export async function main(ns) {
  const options = ns.flags([["max-difficulty", 3], ["sell", false]]);
  ns.disableLog("ALL");
  ns.ui.openTail();
  ns.print("Waiting for an infiltration. Open one with the Infiltrate Company button.");
  const reportedStages = new WeakSet();
  let lastLevel = 0;
  let finished = null;
  while (true) {
    const infiltration = findInfiltration();
    if (infiltration) {
      try {
        const stage = infiltration.stage;
        const kind = stageKind(stage);
        if (kind === "idle" && infiltration.gameStartTimestamp < 0) {
          startIfAllowed(ns, infiltration, Number(options["max-difficulty"]), reportedStages);
        } else if (kind === "idle") {
          if (finished !== infiltration) {
            finished = infiltration;
            ns.print(`Infiltration of ${infiltration.location.name} complete: level ${infiltration.maxLevel} / ${infiltration.maxLevel}.`);
          }
          if (options.sell) clickSell();
        } else if (kind !== "get-ready") {
          if (infiltration.level !== lastLevel) {
            lastLevel = infiltration.level;
            ns.print(`Level ${infiltration.level} / ${infiltration.maxLevel}: ${kind}`);
          }
          SOLVERS[kind](infiltration, stage);
        }
      } catch (error) {
        if (!reportedStages.has(infiltration.stage)) {
          reportedStages.add(infiltration.stage);
          ns.print(`ERROR ${error}`);
        }
      }
    }
    await ns.sleep(TICK_MS);
  }
}

// The infiltration screen's components get the game's infiltration object as the prop `state` (start screen,
// every mini-game, success screen): walk up the React fibers from any h4 on the page.
function findInfiltration() {
  for (const heading of doc.querySelectorAll("h4")) {
    const fiberKey = Object.keys(heading).find((key) => key.startsWith("__reactFiber$"));
    if (!fiberKey) continue;
    for (let fiber = heading[fiberKey]; fiber; fiber = fiber.return) {
      const candidate = fiber.memoizedProps?.state;
      if (candidate && typeof candidate.onSuccess === "function" && "stage" in candidate) return candidate;
    }
  }
  return null;
}

// Stage classes are minified, so recognise the games by their fields.
/** @param {any} stage */
function stageKind(stage) {
  if ("guess" in stage && "answer" in stage) return "type-it";
  if ("left" in stage && "right" in stage) return "close-the-brackets";
  if ("choices" in stage) return "say-something-nice";
  if ("code" in stage) return "enter-the-code";
  if ("grid" in stage && "answers" in stage) return "match-the-symbols";
  if ("minefield" in stage) return "mark-the-mines";
  if ("guardingTime" in stage) return "slash";
  if ("wires" in stage) return "cut-the-wires";
  if ("count" in stage) return "get-ready";
  return "idle"; // start screen (gameStartTimestamp -1) or success screen
}

/** @param {NS} ns @param {any} infiltration @param {number} maxDifficulty @param {WeakSet<object>} reportedStages */
function startIfAllowed(ns, infiltration, maxDifficulty, reportedStages) {
  if (reportedStages.has(infiltration)) return;
  reportedStages.add(infiltration);
  const difficulty = infiltration.startingDifficulty;
  if (difficulty >= REFUSE_DIFFICULTY || difficulty > maxDifficulty) {
    ns.print(`${infiltration.location.name}: difficulty ${difficulty.toFixed(2)} is above the limit `
      + `${Math.min(maxDifficulty, REFUSE_DIFFICULTY - 0.01)}. Not starting (train first or pick an easier location).`);
    return;
  }
  ns.print(`Starting ${infiltration.location.name} (difficulty ${difficulty.toFixed(2)}, ${infiltration.maxLevel} levels).`);
  infiltration.startInfiltration();
}

function clickSell() {
  const button = [...doc.querySelectorAll("button")].find((candidate) => candidate.textContent.startsWith("Sell for"));
  button?.click();
}

// Same shape as the KeyboardEvent fields the stages read (key, shiftKey/ctrlKey/altKey, preventDefault).
/** @param {any} infiltration @param {any} stage @param {string} key */
function pressKey(infiltration, stage, key) {
  if (infiltration.stage !== stage) return false; // the stage was solved or failed by an earlier key
  stage.onKey({ key, shiftKey: false, ctrlKey: false, altKey: false, preventDefault() {} });
  return infiltration.stage === stage;
}

// WASD moves the cursor of the symbol and mine grids and wraps around at the edges.
/** @param {any} infiltration @param {any} stage @param {number} targetX @param {number} targetY @param {number} width @param {number} height */
function moveCursorTo(infiltration, stage, targetX, targetY, width, height) {
  const stepsRight = (targetX - stage.x + width) % width;
  const stepsDown = (targetY - stage.y + height) % height;
  const horizontal = stepsRight <= width - stepsRight ? { key: "d", count: stepsRight } : { key: "a", count: width - stepsRight };
  const vertical = stepsDown <= height - stepsDown ? { key: "s", count: stepsDown } : { key: "w", count: height - stepsDown };
  for (const { key, count } of [horizontal, vertical]) {
    for (let step = 0; step < count; step++) {
      if (!pressKey(infiltration, stage, key)) return false;
    }
  }
  return true;
}

/** @type {Record<string, (infiltration: any, stage: any) => void>} */
const SOLVERS = {
  "type-it": (infiltration, stage) => {
    for (const character of stage.answer.slice(stage.guess.length)) {
      if (!pressKey(infiltration, stage, character)) return;
    }
  },

  "close-the-brackets": (infiltration, stage) => {
    /** @type {Record<string, string>} */
    const closing = { "(": ")", "[": "]", "{": "}", "<": ">" };
    const needed = [...stage.left].reverse().map((opening) => closing[opening]);
    for (const character of needed.slice(stage.right.length)) {
      if (!pressKey(infiltration, stage, character)) return;
    }
  },

  // "w"/"d" move the highlighted adjective forward, "a"/"s" back; space confirms.
  "say-something-nice": (infiltration, stage) => {
    const count = stage.choices.length;
    const steps = (stage.correctIndex - stage.index + count) % count;
    for (let step = 0; step < steps; step++) {
      if (!pressKey(infiltration, stage, "w")) return;
    }
    pressKey(infiltration, stage, " ");
  },

  "enter-the-code": (infiltration, stage) => {
    /** @type {Record<string, string>} */
    const keyForArrow = { "↑": "w", "↓": "s", "←": "a", "→": "d" };
    for (const arrow of stage.code.slice(stage.index)) {
      if (!pressKey(infiltration, stage, keyForArrow[arrow])) return;
    }
  },

  "match-the-symbols": (infiltration, stage) => {
    const height = stage.grid.length;
    const width = stage.grid[0].length;
    for (const symbol of stage.answers.slice(stage.currentAnswerIndex)) {
      let best = null;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (stage.grid[y][x] !== symbol) continue;
          const dx = Math.abs(x - stage.x);
          const dy = Math.abs(y - stage.y);
          const distance = Math.min(dx, width - dx) + Math.min(dy, height - dy);
          if (!best || distance < best.distance) best = { x, y, distance };
        }
      }
      if (!best || !moveCursorTo(infiltration, stage, best.x, best.y, width, height)) return;
      if (!pressKey(infiltration, stage, " ")) return;
    }
  },

  "mark-the-mines": (infiltration, stage) => {
    if (stage.memoryPhase) return; // keys are ignored for the first 2 s while the mines are shown
    const height = stage.minefield.length;
    const width = stage.minefield[0].length;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!stage.minefield[y][x] || stage.answer[y][x]) continue;
        if (!moveCursorTo(infiltration, stage, x, y, width, height)) return;
        if (!pressKey(infiltration, stage, " ")) return;
      }
    }
  },

  // Space only works in phase 1 ("Distracted!"); phase 0 and 2 (guarding / alerted) fail.
  "slash": (infiltration, stage) => {
    if (stage.phase === 1) pressKey(infiltration, stage, " ");
  },

  "cut-the-wires": (infiltration, stage) => {
    for (const wireIndex of [...stage.wiresToCut]) {
      if (!pressKey(infiltration, stage, String(wireIndex + 1))) return;
    }
  },
};
