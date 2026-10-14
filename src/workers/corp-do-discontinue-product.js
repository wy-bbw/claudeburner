import { performCalls } from "lib/corp-calls.js";

// corp-do-discontinue-product.js <JSON list of [division, product]>: discontinues a product (frees a product slot).
// One corporation action per script (20 GB); started via lib/corp-scripts.js runAction. Results -> data/corp/do-discontinue-product.txt
/** @param {NS} ns */
export async function main(ns) {
  performCalls(ns, "discontinue-product", ([division, product]) => ns.corporation.discontinueProduct(division, product));
}
