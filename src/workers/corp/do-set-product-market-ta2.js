import { performCalls } from "lib/corp-calls.js";

// workers/corp/do-set-product-market-ta2.js <JSON list of [division, product, on]>: turns Market-TA.II pricing on or off for a product.
// One corporation action per script (20 GB); started via lib/corp-scripts.js runAction. Results -> data/corp/do-set-product-market-ta2.txt
/** @param {NS} ns */
export async function main(ns) {
  performCalls(ns, "set-product-market-ta2", ([division, product, on]) => ns.corporation.setProductMarketTA2(division, product, on));
}
