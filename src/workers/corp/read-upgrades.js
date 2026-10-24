// workers/corp/read-upgrades.js: started by services/corp/status.js (one corporation call per script, 10 GB each): the level
// of every corporation upgrade (Smart Factories, Wilson Analytics...) -> data/corp/upgrades.txt as {name: level}
/** @param {NS} ns */
export async function main(ns) {
  const levels = Object.fromEntries(ns.corporation.getConstants().upgradeNames.map((name) => [name, ns.corporation.getUpgradeLevel(name)]));
  ns.write("data/corp/upgrades.txt", JSON.stringify(levels), "w");
}
