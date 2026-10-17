import { REFUSE_DIFFICULTY, findInfiltration, sellForMoney, solveCurrentStage, stageKind } from "lib/infiltration-minigames.js";

const TICK_MS = 5;

// infiltration-solver.js: plays every infiltration mini-game for you (game v3.0.1, read from main.bundle.js).
// Open an infiltration yourself (Infiltrate Company button: the game wants a real click there), the script presses
// Start and solves every level, ~1.3 s per level (the "Get Ready" countdown is the game's own). For the full loop
// (travel, open, solve, trade) use services/infiltration-autopilot.js. Mechanism: lib/infiltration-minigames.js.
// Costs ~1.6 GB (no ns calls except sleep).
//   --max-difficulty <n>  do not press Start above this difficulty (default 3; the game's own cap is 3.5)
//   --sell                click "Sell for $..." on the success screen (default: leave the choice money/rep to you)
// Usage: run services/infiltration-solver.js    (stop it with tools/kill.js or the tail window)
/** @param {NS} ns */
export async function main(ns) {
  const options = ns.flags([["max-difficulty", 3], ["sell", false]]);
  const maxDifficulty = Number(options["max-difficulty"]);
  ns.disableLog("ALL");
  ns.ui.openTail();
  ns.print("Waiting for an infiltration. Open one with the Infiltrate Company button.");
  const reported = new WeakSet();
  let lastLevel = 0;
  let finished = null;
  while (true) {
    const infiltration = findInfiltration();
    if (infiltration) {
      try {
        const kind = stageKind(infiltration.stage);
        if (kind === "idle" && infiltration.gameStartTimestamp < 0) {
          if (!reported.has(infiltration)) {
            reported.add(infiltration);
            const difficulty = infiltration.startingDifficulty;
            if (difficulty >= REFUSE_DIFFICULTY || difficulty > maxDifficulty) {
              ns.print(`${infiltration.location.name}: difficulty ${difficulty.toFixed(2)} is above the limit `
                + `${Math.min(maxDifficulty, REFUSE_DIFFICULTY - 0.01)}. Not starting (train first or pick an easier location).`);
            } else {
              ns.print(`Starting ${infiltration.location.name} (difficulty ${difficulty.toFixed(2)}, ${infiltration.maxLevel} levels).`);
              infiltration.startInfiltration();
            }
          }
        } else if (kind === "idle") {
          if (finished !== infiltration) {
            finished = infiltration;
            ns.print(`Infiltration of ${infiltration.location.name} complete: level ${infiltration.maxLevel} / ${infiltration.maxLevel}.`);
          }
          if (options.sell) sellForMoney();
        } else if (kind !== "get-ready") {
          if (infiltration.level !== lastLevel) {
            lastLevel = infiltration.level;
            ns.print(`Level ${infiltration.level} / ${infiltration.maxLevel}: ${kind}`);
          }
          solveCurrentStage(infiltration);
        }
      } catch (error) {
        if (!reported.has(infiltration.stage)) {
          reported.add(infiltration.stage);
          ns.print(`ERROR ${error}`);
        }
      }
    }
    await ns.sleep(TICK_MS);
  }
}
