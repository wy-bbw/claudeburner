import { performCalls } from "lib/corp-calls.js";

// corp-do-set-smart-supply.js <JSON list of [division, city, enabled]>: turns Smart Supply on or off for a warehouse.
// One corporation action per script (20 GB); started via lib/corp-scripts.js runAction. Results -> data/corp/do-set-smart-supply.txt
/** @param {NS} ns */
export async function main(ns) {
  performCalls(ns, "set-smart-supply", ([division, city, enabled]) => ns.corporation.setSmartSupply(division, city, enabled));
}
