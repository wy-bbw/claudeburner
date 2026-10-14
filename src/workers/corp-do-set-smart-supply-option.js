import { performCalls } from "lib/corp-calls.js";

// corp-do-set-smart-supply-option.js <JSON list of [division, city, material, option]>: what Smart Supply counts
// before buying ("leftovers", "imports" or "none").
// One corporation action per script (20 GB); started via lib/corp-scripts.js runAction. Results -> data/corp/do-set-smart-supply-option.txt
/** @param {NS} ns */
export async function main(ns) {
  performCalls(ns, "set-smart-supply-option", ([division, city, material, option]) =>
    ns.corporation.setSmartSupplyOption(division, city, material, option));
}
