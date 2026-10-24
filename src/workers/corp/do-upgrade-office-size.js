import { performCalls } from "lib/corp-calls.js";

// workers/corp/do-upgrade-office-size.js <JSON list of [division, city, increase]>: grows an office by `increase` employees.
// One corporation action per script (20 GB); started via lib/corp-scripts.js runAction. Results -> data/corp/do-upgrade-office-size.txt
/** @param {NS} ns */
export async function main(ns) {
  performCalls(ns, "upgrade-office-size", ([division, city, increase]) => ns.corporation.upgradeOfficeSize(division, city, increase));
}
