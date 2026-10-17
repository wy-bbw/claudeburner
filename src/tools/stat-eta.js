const OUTPUT_FILE = "data/stat-eta.txt";
const STATS = /** @type {const} */ (["strength", "defense", "dexterity", "agility"]);
const SAMPLE_SECONDS = 20;

// stat-eta.js (home): how long until every combat stat reaches --target (default 200, what The Syndicate wants).
// Reads your exp and multipliers, inverts the game's level formula  level = floor(mult x (32 ln(exp + 534.5) - 200)),
// measures the exp per second of the stat that is being trained for 20 s (run gym-trainer.js first) and scales it by
// each stat's exp multiplier. Training is one stat at a time, so the times add up. Written to data/stat-eta.txt.
// Usage: run tools/stat-eta.js [--target 200]
/** @param {NS} ns */
export async function main(ns) {
  const target = Number(ns.flags([["target", 200]]).target);
  const before = ns.getPlayer();
  await ns.sleep(SAMPLE_SECONDS * 1000);
  const after = ns.getPlayer();
  const trained = STATS.map((stat) => ({ stat, perSecond: (after.exp[stat] - before.exp[stat]) / SAMPLE_SECONDS }))
    .sort((a, b) => b.perSecond - a.perSecond)[0];
  if (trained.perSecond <= 0) {
    ns.tprint("No combat exp gained in 20 s: start the gym first (run services/gym-trainer.js --background).");
    return;
  }
  const baseRate = trained.perSecond / after.mults[`${trained.stat}_exp`];
  const expForLevel = (/** @type {number} */ level, /** @type {number} */ mult) => Math.exp((level / mult + 200) / 32) - 534.5;
  let totalSeconds = 0;
  const lines = STATS.map((stat) => {
    const mult = after.mults[stat];
    const needed = Math.max(0, expForLevel(target, mult) - after.exp[stat]);
    const rate = baseRate * after.mults[`${stat}_exp`];
    totalSeconds += needed / rate;
    return `${stat.padEnd(9)} level ${String(after.skills[stat]).padStart(4)}  level x${mult.toFixed(2)}  exp x${after.mults[`${stat}_exp`].toFixed(2)}  `
      + `${ns.format.number(after.exp[stat]).padStart(8)} exp, needs ${ns.format.number(needed).padStart(8)} more at ${rate.toFixed(1)}/s = ${ns.format.time(needed / rate * 1000, true)}`;
  });
  const text = `combat stats to level ${target} (training ${trained.stat} at ${trained.perSecond.toFixed(1)} exp/s)\n${lines.join("\n")}\n`
    + `total: ${ns.format.time(totalSeconds * 1000, true)}\n`;
  ns.write(OUTPUT_FILE, text, "w");
  ns.tprint("\n" + text);
}
