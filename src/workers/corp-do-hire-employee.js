import { performCalls } from "lib/corp-calls.js";

// corp-do-hire-employee.js <JSON list of [division, city, job]>: hires one employee per entry.
// One corporation action per script (20 GB); started via lib/corp-scripts.js runAction. Results -> data/corp/do-hire-employee.txt
/** @param {NS} ns */
export async function main(ns) {
  performCalls(ns, "hire-employee", ([division, city, job]) => { if (!ns.corporation.hireEmployee(division, city, job)) throw new Error("office full"); });
}
