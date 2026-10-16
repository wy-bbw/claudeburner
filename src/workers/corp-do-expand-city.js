import { performCalls } from "lib/corp-calls.js";

// corp-do-expand-city.js <JSON list of [division, city]>: opens a division's office in a city ($4b).
// One corporation action per script (20 GB); started via lib/corp-scripts.js runAction. Results -> data/corp/do-expand-city.txt
/** @param {NS} ns */
export async function main(ns) {
  performCalls(ns, "expand-city", ([division, city]) => ns.corporation.expandCity(division, city));
}
