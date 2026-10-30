import { cycleSeconds } from "lib/infiltration-targets.js";
import { REFUSE_DIFFICULTY } from "lib/infiltration-minigames.js";

const OUTPUT_FILE = "data/best-infiltration.txt";

// best-infiltration.js: the infiltration target that pays the most money per second for your current stats, and its
// city, ranked like services/infiltration-autopilot.js (money / cycle time, the cycle including the wait for the market
// demand). Prints the runners-up too; also written to data/best-infiltration.txt. Difficulty depends on your stats:
// run it again as they grow.
// Usage: run tools/best-infiltration.js [--max-difficulty 3.4] [--min-demand 0.75] [--top 5]
/** @param {NS} ns */
export async function main(ns) {
  const options = ns.flags([["max-difficulty", 3.4], ["min-demand", 0.75], ["top", 5]]);
  const maxDifficulty = Math.min(Number(options["max-difficulty"]), REFUSE_DIFFICULTY - 0.01);
  const minDemand = Number(options["min-demand"]);
  const targets = ns.infiltration.getPossibleLocations().map((location) => {
    const info = ns.infiltration.getInfiltration(location.name);
    const money = info.reward.sellCash;
    return { name: location.name, city: location.city, difficulty: info.difficulty, levels: info.maxClearanceLevel,
      money, moneyPerSecond: money / cycleSeconds(info.maxClearanceLevel, minDemand) };
  }).filter((target) => target.difficulty <= maxDifficulty).sort((a, b) => b.moneyPerSecond - a.moneyPerSecond);
  if (!targets.length) {
    ns.tprint(`No infiltration target at difficulty <= ${maxDifficulty} for your current stats.`);
    return;
  }
  const best = targets[0];
  const describe = (/** @type {typeof best} */ target) => `${target.name} in ${target.city}: $${ns.format.number(target.money)} per run `
    + `($${ns.format.number(target.moneyPerSecond)}/s), difficulty ${target.difficulty.toFixed(2)}, ${target.levels} levels`;
  const lines = [`Best: ${describe(best)}`, ...targets.slice(1, Number(options.top)).map((target) => `  then ${describe(target)}`)];
  ns.write(OUTPUT_FILE, lines.join("\n") + "\n", "w");
  ns.tprint("\n" + lines.join("\n"));
}
