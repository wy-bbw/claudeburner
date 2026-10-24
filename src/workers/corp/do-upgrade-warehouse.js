import { performCalls } from "lib/corp-calls.js";

// workers/corp/do-upgrade-warehouse.js <JSON list of [division, city, levels]>: buys warehouse levels.
// One corporation action per script (20 GB); started via lib/corp-scripts.js runAction. Results -> data/corp/do-upgrade-warehouse.txt
/** @param {NS} ns */
export async function main(ns) {
  performCalls(ns, "upgrade-warehouse", ([division, city, levels]) => ns.corporation.upgradeWarehouse(division, city, levels));
}
