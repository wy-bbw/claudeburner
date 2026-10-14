import { performCalls } from "lib/corp-calls.js";

// corp-do-throw-party.js <JSON list of [division, city, costPerEmployee]>: throws a party (morale x (1 + cost per employee / 1e7) at the next cycle).
// One corporation action per script (20 GB); started via lib/corp-scripts.js runAction. Results -> data/corp/do-throw-party.txt
/** @param {NS} ns */
export async function main(ns) {
  performCalls(ns, "throw-party", ([division, city, costPerEmployee]) => ns.corporation.throwParty(division, city, costPerEmployee));
}
