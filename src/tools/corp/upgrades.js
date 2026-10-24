import { AUTO_UPGRADES } from "lib/corp-upgrades.js";

// tools/corp/upgrades.js: asks services/corp/manager.js to spend --budget-fraction of funds on corporation upgrades (Smart
// Factories, Smart Storage, the four employee upgrades, Project Insight), always the cheapest next level first
// (lib/corp-upgrades.js). Queued in data/corp-requests.txt; the manager logs the result in data/corp-manager.txt.
// --dry-run only logs the plan.
// Usage: run tools/corp/upgrades.js [--budget-fraction 0.2] [--dry-run]
/** @param {NS} ns */
export async function main(ns) {
  const flags = ns.flags([["budget-fraction", 0.2], ["dry-run", false]]);
  const request = { type: "upgrades", names: AUTO_UPGRADES, budgetFraction: Number(flags["budget-fraction"]), dryRun: Boolean(flags["dry-run"]), time: Date.now() };
  ns.write("data/corp-requests.txt", JSON.stringify(request) + "\n", "a");
  ns.tprint(`queued: ${JSON.stringify(request)} (services/corp/manager.js runs it within ~30 s, see data/corp-manager.txt)`);
}
