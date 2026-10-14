import { performCalls } from "lib/corp-calls.js";

// corp-do-buy-tea.js <JSON list of [division, city]>: buys tea for an office (+2 energy at the next cycle; refused while one is pending).
// One corporation action per script (20 GB); started via lib/corp-scripts.js runAction. Results -> data/corp/do-buy-tea.txt
/** @param {NS} ns */
export async function main(ns) {
  performCalls(ns, "buy-tea", ([division, city]) => ns.corporation.buyTea(division, city));
}
