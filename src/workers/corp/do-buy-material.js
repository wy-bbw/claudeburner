import { performCalls } from "lib/corp-calls.js";

// workers/corp/do-buy-material.js <JSON list of [division, city, material, amount per second]>: sets a material's buy order (0 = off).
// The game pays a buy order in the PURCHASE state of each market cycle (10 s x rate) without checking funds, so unlike
// bulkPurchase it can take the corporation into debt.
// One corporation action per script (20 GB); started via lib/corp-scripts.js runAction. Results -> data/corp/do-buy-material.txt
/** @param {NS} ns */
export async function main(ns) {
  performCalls(ns, "buy-material", ([division, city, material, rate]) => ns.corporation.buyMaterial(division, city, material, rate));
}
