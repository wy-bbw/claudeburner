import { performCalls } from "lib/corp-calls.js";

// corp-do-bulk-purchase.js <JSON list of [division, city, material, amount]>: buys material at once (paid upfront,
// needs the warehouse space).
// One corporation action per script (20 GB); started via lib/corp-scripts.js runAction. Results -> data/corp/do-bulk-purchase.txt
/** @param {NS} ns */
export async function main(ns) {
  performCalls(ns, "bulk-purchase", ([division, city, material, amount]) => ns.corporation.bulkPurchase(division, city, material, amount));
}
