import { performCalls } from "lib/corp-calls.js";

// workers/corp/do-sell-product.js <JSON list of [division, city, product, amount, price, allCities]>: sets a product's sell order.
// One corporation action per script (20 GB); started via lib/corp-scripts.js runAction. Results -> data/corp/do-sell-product.txt
/** @param {NS} ns */
export async function main(ns) {
  performCalls(ns, "sell-product", ([division, city, product, amount, price, allCities]) => ns.corporation.sellProduct(division, city, product, amount, price, allCities));
}
