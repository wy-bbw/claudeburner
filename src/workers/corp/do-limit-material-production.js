import { performCalls } from "lib/corp-calls.js";

// workers/corp/do-limit-material-production.js <JSON list of [division, city, material, amountPerSecond]>: caps how much of a
// material a division produces (-1 removes the cap). E.g. Robotics: Robots material at 0 leaves the inputs to products.
// One corporation action per script (20 GB); started via lib/corp-scripts.js runAction. Results -> data/corp/do-limit-material-production.txt
/** @param {NS} ns */
export async function main(ns) {
  performCalls(ns, "limit-material-production", ([division, city, material, amount]) => ns.corporation.limitMaterialProduction(division, city, material, amount));
}
