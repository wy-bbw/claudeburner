// corp-limit-production.js: asks services/corp-manager.js to cap a material's production in every city of a division
// (--amount per second; -1 removes the cap). A cap of 0 becomes 0.001: the game averages the produced material's quality
// as (quality x stock + new x produced) / (stock + produced), which is 0/0 = NaN once stock and production are both 0,
// and NaN never leaves again (unsellable; only a save + reload turns it back into a number). For industries that make a material and products from the same inputs
// (Robotics: Robots), the material otherwise takes all inputs and the products get none. Queued in
// data/corp-requests.txt; result in data/corp-manager.txt.
// Usage: run tools/corp-limit-production.js --division "da end" --material Robots [--amount 0]
const MIN_CAP = 0.001;

/** @param {NS} ns */
export async function main(ns) {
  const flags = ns.flags([["division", ""], ["material", ""], ["amount", 0]]);
  if (!String(flags.division) || !String(flags.material)) { ns.tprint("give --division and --material"); return; }
  const request = { type: "limit-production", division: String(flags.division), material: String(flags.material), amount: Number(flags.amount) === 0 ? MIN_CAP : Number(flags.amount), time: Date.now() };
  ns.write("data/corp-requests.txt", JSON.stringify(request) + "\n", "a");
  ns.tprint(`queued: ${JSON.stringify(request)} (services/corp-manager.js runs it within ~30 s, see data/corp-manager.txt)`);
}
