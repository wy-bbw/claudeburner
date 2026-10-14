import { performCalls } from "lib/corp-calls.js";

// corp-do-export-material.js <JSON list of [sourceDivision, sourceCity, targetDivision, targetCity, material, amount]>:
// sets up an export between divisions (needs the Export unlock).
// One corporation action per script (20 GB); started via lib/corp-scripts.js runAction. Results -> data/corp/do-export-material.txt
/** @param {NS} ns */
export async function main(ns) {
  performCalls(ns, "export-material", ([sourceDivision, sourceCity, targetDivision, targetCity, material, amount]) =>
    ns.corporation.exportMaterial(sourceDivision, sourceCity, targetDivision, targetCity, material, amount));
}
