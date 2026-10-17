// Shared by services/infiltration-solver.js and services/infiltration-autopilot.js (game v3.0.1, read from main.bundle.js).
// The game's infiltration object is found in the React tree and its mini-games are played by calling stage.onKey(...)
// directly: the document keydown listener is the only place that checks event.isTrusted (and punishes automation with a
// hospital stay), so it is never involved. No ns calls here: importing this file costs no RAM.
const wnd = eval("window"); // the identifier `document` itself would cost 25 GB
const doc = wnd["document"];

/** The game kills you on "Start" at this difficulty (startInfiltration -> takeDamage(all hp)). */
export const REFUSE_DIFFICULTY = 3.5;

const FIBER_PREFIX = "__reactFiber$";

/** @param {Element} element @returns {any} the React fiber of a DOM node, or null */
function fiberOf(element) {
  const key = Object.keys(element).find((name) => name.startsWith(FIBER_PREFIX));
  return key ? /** @type {any} */ (element)[key] : null;
}

/**
 * The first fiber at or above the element whose props satisfy the test.
 * @param {Element} element @param {(props: any) => boolean} test @returns {any} the props, or null
 */
function propsAbove(element, test) {
  for (let fiber = fiberOf(element); fiber; fiber = fiber.return) {
    if (fiber.memoizedProps && test(fiber.memoizedProps)) return fiber.memoizedProps;
  }
  return null;
}

/** @param {string} selector @param {(text: string) => boolean} test @returns {Element | undefined} */
export function findElement(selector, test) {
  return [...doc.querySelectorAll(selector)].find((element) => test(element.textContent ?? ""));
}

/**
 * The game's infiltration object (start screen, every mini-game, success screen): the screen's components get it as the
 * prop `state`, so walk up the React fibers from any h4 on the page. Null when no infiltration is open.
 * @returns {any}
 */
export function findInfiltration() {
  for (const heading of doc.querySelectorAll("h4")) {
    const props = propsAbove(heading, (candidate) => candidate.state && typeof candidate.state.onSuccess === "function" && "stage" in candidate.state);
    if (props) return props.state;
  }
  return null;
}

/**
 * Presses the "Infiltrate Company" button of the open location page. The button's handler only wants event.isTrusted.
 * @returns {boolean} whether the button was there
 */
export function pressInfiltrateButton() {
  const button = findElement("button", (text) => text === "Infiltrate Company");
  const props = button && propsAbove(button, (candidate) => typeof candidate.onClick === "function");
  if (!props) return false;
  props.onClick({ isTrusted: true });
  return true;
}

/** Clicks "Sell for $..." on the success screen. @returns {boolean} whether the button was there */
export function sellForMoney() {
  const button = /** @type {HTMLElement | undefined} */ (findElement("button", (text) => text.startsWith("Sell for")));
  if (!button) return false;
  button.click();
  return true;
}

/**
 * Picks the faction in the success screen's drop-down. The click on "Trade for ..." follows one tick later (React state).
 * @param {string} faction @returns {boolean} whether the drop-down was there
 */
export function chooseTradeFaction(faction) {
  const select = doc.querySelector('[role="combobox"]');
  const props = select && propsAbove(select, (candidate) => typeof candidate.onChange === "function" && "value" in candidate);
  if (!props) return false;
  props.onChange({ target: { value: faction } });
  return true;
}

/** Clicks "Trade for ..." on the success screen. @returns {boolean} whether the button was there and enabled */
export function tradeForReputation() {
  const button = /** @type {HTMLButtonElement | undefined} */ (findElement("button", (text) => text.startsWith("Trade for")));
  if (!button || button.disabled) return false;
  button.click();
  return true;
}

// Stage classes are minified, so recognise the games by their fields.
/** @param {any} stage */
export function stageKind(stage) {
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

/** Plays whatever the current stage needs. Safe to call every few ms. @param {any} infiltration */
export function solveCurrentStage(infiltration) {
  const stage = infiltration.stage;
  const kind = stageKind(stage);
  if (kind !== "idle" && kind !== "get-ready") SOLVERS[kind](infiltration, stage);
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
