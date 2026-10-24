// tools/corp/add-division.js <division> [--budget-fraction f]: sets up a new division in one go. Queues an "add-division"
// request; services/corp/manager.js turns it into the steps for that industry and runs them next, one per round:
//   expand (every city, warehouses, Smart Supply, sell orders) -> product divisions: main office (product job split)
//   -> all offices -> warehouse levels + boosts -> supply chain exports -> product divisions: Advert.
// Each spending step uses --budget-fraction of the funds at that moment (default 0.5%). Create the division in the
// game first (industry + name). Results in data/corp-manager.txt.
// Usage: run tools/corp/add-division.js megahard [--budget-fraction 0.005]
/** @param {NS} ns */
export async function main(ns) {
  const flags = ns.flags([["budget-fraction", 0.005]]);
  const division = /** @type {string[]} */ (flags._).map(String).join(" ");
  if (!division) { ns.tprint("usage: run tools/corp/add-division.js <division> [--budget-fraction 0.005]"); return; }
  const request = { type: "add-division", division, budgetFraction: Number(flags["budget-fraction"]), time: Date.now() };
  ns.write("data/corp-requests.txt", JSON.stringify(request) + "\n", "a");
  ns.tprint(`queued: ${JSON.stringify(request)} (services/corp/manager.js runs the steps one per round, see data/corp-manager.txt)`);
}
