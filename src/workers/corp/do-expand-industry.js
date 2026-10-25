import { performCalls } from "lib/corp-calls.js";

// workers/corp/do-expand-industry.js <JSON list of [industry, division name]>: creates a new division.
// One corporation action per script (20 GB); started via lib/corp-scripts.js runAction. Results -> data/corp/do-expand-industry.txt
/** @param {NS} ns */
export async function main(ns) {
  performCalls(ns, "expand-industry", ([industry, name]) => ns.corporation.expandIndustry(industry, name));
}
