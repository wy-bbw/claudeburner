import { performCalls } from "lib/corp-calls.js";

// corp-do-purchase-warehouse.js <JSON list of [division, city]>: buys a division's warehouse in a city ($5b).
// One corporation action per script (20 GB); started via lib/corp-scripts.js runAction. Results -> data/corp/do-purchase-warehouse.txt
/** @param {NS} ns */
export async function main(ns) {
  performCalls(ns, "purchase-warehouse", ([division, city]) => ns.corporation.purchaseWarehouse(division, city));
}
