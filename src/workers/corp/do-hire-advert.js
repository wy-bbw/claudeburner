import { performCalls } from "lib/corp-calls.js";

// workers/corp/do-hire-advert.js <JSON list of [division]>: buys one Advert level per entry.
// One corporation action per script (20 GB); started via lib/corp-scripts.js runAction. Results -> data/corp/do-hire-advert.txt
/** @param {NS} ns */
export async function main(ns) {
  performCalls(ns, "hire-advert", ([division]) => ns.corporation.hireAdVert(division));
}
