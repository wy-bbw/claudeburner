// tools/corp/adverts.js: asks services/corp/manager.js to buy as many Advert levels for a division as --budget-fraction of
// funds pays for (level n costs 1e9 * 1.06^n, counted per division). Queued in data/corp-requests.txt; also runs in
// the manager's --upkeep-and-prices-only mode. --dry-run only logs the plan.
// Usage: run tools/corp/adverts.js --division restaurant [--budget-fraction 0.2] [--dry-run]
/** @param {NS} ns */
export async function main(ns) {
  const flags = ns.flags([["division", ""], ["budget-fraction", 0.2], ["dry-run", false]]);
  if (!String(flags.division)) { ns.tprint("give --division"); return; }
  const request = { type: "adverts", division: String(flags.division), budgetFraction: Number(flags["budget-fraction"]), dryRun: Boolean(flags["dry-run"]), time: Date.now() };
  ns.write("data/corp-requests.txt", JSON.stringify(request) + "\n", "a");
  ns.tprint(`queued: ${JSON.stringify(request)} (services/corp/manager.js runs it within ~30 s, see data/corp-manager.txt)`);
}
