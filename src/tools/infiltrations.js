const OUTPUT_FILE = "data/infiltrations.txt";

// infiltrations.js: every infiltration target for your current stats (ns.infiltration, 15 GB): difficulty, levels,
// money and faction reputation it pays, sorted easiest first; marks the best money per difficulty point.
// Also written to data/infiltrations.txt. Run it again as your stats grow: difficulty depends on them.
// Usage: run tools/infiltrations.js
/** @param {NS} ns */
export async function main(ns) {
  const rows = ns.infiltration.getPossibleLocations().map((location) => {
    const info = ns.infiltration.getInfiltration(location.name);
    return { name: location.name, city: location.city, difficulty: info.difficulty, levels: info.maxClearanceLevel,
      money: info.reward.sellCash, reputation: info.reward.tradeRep };
  }).sort((a, b) => a.difficulty - b.difficulty);
  const bestValue = [...rows].sort((a, b) => b.money / Math.max(b.difficulty, 0.1) - a.money / Math.max(a.difficulty, 0.1))[0];
  const lines = rows.map((row) => `${row.difficulty.toFixed(2).padStart(5)}  ${String(row.levels).padStart(2)} levels  `
    + `$${ns.format.number(row.money).padStart(9)}  rep ${ns.format.number(row.reputation).padStart(8)}  ${row.city.padEnd(10)} ${row.name}`
    + (row === bestValue ? "   <- most money per difficulty" : ""));
  const text = `difficulty  levels  money  faction rep  city  location (easiest first)\n${lines.join("\n")}\n`;
  ns.write(OUTPUT_FILE, text, "w");
  ns.tprint("\n" + text);
}
