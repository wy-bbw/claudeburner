import { performCalls } from "lib/corp-calls.js";

// corp-do-make-product.js <JSON list of [division, city, product, designInvestment, marketingInvestment]>: starts developing a product.
// One corporation action per script (20 GB); started via lib/corp-scripts.js runAction. Results -> data/corp/do-make-product.txt
/** @param {NS} ns */
export async function main(ns) {
  performCalls(ns, "make-product", ([division, city, product, design, marketing]) => ns.corporation.makeProduct(division, city, product, design, marketing));
}
