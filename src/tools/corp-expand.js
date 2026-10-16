// corp-expand.js: asks services/corp-manager.js to open a division in every city: offices ($4b each), warehouses ($5b
// each), Smart Supply on, a MAX / MP sell order for every material the industry produces (the manager's pricing then
// adjusts it). Queued in data/corp-requests.txt; result in data/corp-manager.txt. --dry-run only logs the plan.
// Then: tools/corp-office.js (staff), tools/corp-boosts.js (warehouse levels + boosts), tools/corp-exports.js (inputs).
// Usage: run tools/corp-expand.js --division sicko [--dry-run]
/** @param {NS} ns */
export async function main(ns) {
  const flags = ns.flags([["division", ""], ["dry-run", false]]);
  if (!String(flags.division)) { ns.tprint("give --division"); return; }
  const request = { type: "expand", division: String(flags.division), dryRun: Boolean(flags["dry-run"]), time: Date.now() };
  ns.write("data/corp-requests.txt", JSON.stringify(request) + "\n", "a");
  ns.tprint(`queued: ${JSON.stringify(request)} (services/corp-manager.js runs it within ~30 s, see data/corp-manager.txt)`);
}
