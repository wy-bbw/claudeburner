// tools/corp/boosts.js: asks services/corp/manager.js to upgrade a division's warehouses and buy the optimal boost materials
// (lib/corp-boosts.js): the highest warehouse level in all its cities at which upgrades + boosts filling --fill of the
// space cost at most --budget-fraction of funds. The manager runs it in its next round and logs the result in
// data/corp-manager.txt. Only queues a request in data/corp-requests.txt: the 21.6 GB workers need the RAM a tool would take.
// --dry-run only logs the plan (levels and amounts per city).
// Usage: run tools/corp/boosts.js [--division tobacco] [--budget-fraction 0.3] [--fill 0.6] [--dry-run]
/** @param {NS} ns */
export async function main(ns) {
  const flags = ns.flags([["division", "tobacco"], ["budget-fraction", 0.3], ["fill", 0.6], ["dry-run", false]]);
  const request = { type: "boosts", division: String(flags.division), budgetFraction: Number(flags["budget-fraction"]), fill: Number(flags.fill), dryRun: Boolean(flags["dry-run"]), time: Date.now() };
  ns.write("data/corp-requests.txt", JSON.stringify(request) + "\n", "a");
  ns.tprint(`queued: ${JSON.stringify(request)} (services/corp/manager.js runs it within ~30 s, see data/corp-manager.txt)`);
}
