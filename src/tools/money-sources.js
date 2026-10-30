// money-sources.js: where your money comes from. Measures every money source of ns.getMoneySources (since the last
// install) over --seconds and prints the rate per second of each one that changed, plus the totals since the install
// -> terminal and data/money-sources.txt.
// Usage: run tools/money-sources.js [--seconds 30]
/** @param {NS} ns */
export async function main(ns) {
  const options = ns.flags([["seconds", 30]]);
  const seconds = Number(options.seconds);
  const before = ns.getMoneySources().sinceInstall;
  await ns.sleep(seconds * 1000);
  const after = ns.getMoneySources().sinceInstall;
  const sources = /** @type {(keyof typeof after)[]} */ (Object.keys(after)).filter((source) => source !== "total");
  const lines = [`money per second over ${seconds} s (total since install in brackets):`];
  for (const source of sources.sort((a, b) => (after[b] - before[b]) - (after[a] - before[a]))) {
    const rate = (after[source] - before[source]) / seconds;
    if (rate !== 0) lines.push(`  ${source.padEnd(16)} $${ns.format.number(rate).padStart(9)}/s   ($${ns.format.number(after[source])})`);
  }
  lines.push(`  ${"total".padEnd(16)} $${ns.format.number((after.total - before.total) / seconds).padStart(9)}/s   ($${ns.format.number(after.total)})`);
  ns.write("data/money-sources.txt", lines.join("\n") + "\n", "w");
  ns.tprint("\n" + lines.join("\n"));
}
