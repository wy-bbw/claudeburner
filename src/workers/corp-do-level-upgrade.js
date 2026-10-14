import { performCalls } from "lib/corp-calls.js";

// corp-do-level-upgrade.js <JSON list of [upgradeName]>: buys one level of a corporation upgrade per entry (Wilson Analytics, Smart Factories...).
// One corporation action per script (20 GB); started via lib/corp-scripts.js runAction. Results -> data/corp/do-level-upgrade.txt
/** @param {NS} ns */
export async function main(ns) {
  performCalls(ns, "level-upgrade", ([upgrade]) => ns.corporation.levelUpgrade(upgrade));
}
