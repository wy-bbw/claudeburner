// workers/corp/read-unlocks.js <JSON list of unlock names>: started by services/corp-startup.js (two corporation calls, 10 GB
// each): per unlock whether the corporation has it and what it costs -> data/corp/unlocks.txt
/** @param {NS} ns */
export async function main(ns) {
  const names = /** @type {Parameters<typeof ns.corporation.hasUnlock>[0][]} */ (JSON.parse(String(ns.args[0])));
  const unlocks = names.map((name) => ({ name, owned: ns.corporation.hasUnlock(name), cost: ns.corporation.getUnlockCost(name) }));
  ns.write("data/corp/unlocks.txt", JSON.stringify(unlocks), "w");
}
