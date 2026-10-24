import { performCalls } from "lib/corp-calls.js";

// workers/corp/do-sell-material.js <JSON list of [division, city, material, amount, price]>: sets a material's sell order.
// One corporation action per script (20 GB); started via lib/corp-scripts.js runAction. Results -> data/corp/do-sell-material.txt
/** @param {NS} ns */
export async function main(ns) {
  performCalls(ns, "sell-material", ([division, city, material, amount, price]) => ns.corporation.sellMaterial(division, city, material, amount, price));
}
