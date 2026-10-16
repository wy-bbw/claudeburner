// corp-exports.js: asks services/corp-manager.js to set up the supply chain: every division gets every input material
// another division produces (from the game's industry data: Plants Agriculture -> Chemical/Tobacco, Chemicals
// Chemical -> Agriculture/Pharmaceutical, Food Agriculture -> Restaurant, ...), in every city where both have a
// warehouse, with Smart Supply of imported materials on "leftovers". Existing exports are kept: run it again after
// adding cities or divisions. Queued in data/corp-requests.txt; result in data/corp-manager.txt. --dry-run logs the plan.
// Usage: run tools/corp-exports.js [--dry-run]
/** @param {NS} ns */
export async function main(ns) {
  const flags = ns.flags([["dry-run", false]]);
  const request = { type: "exports", dryRun: Boolean(flags["dry-run"]), time: Date.now() };
  ns.write("data/corp-requests.txt", JSON.stringify(request) + "\n", "a");
  ns.tprint(`queued: ${JSON.stringify(request)} (services/corp-manager.js runs it within ~30 s, see data/corp-manager.txt)`);
}
