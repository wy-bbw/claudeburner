import { performCalls } from "lib/corp-calls.js";

// workers/corp/do-cancel-export-material.js <JSON list of [source division, source city, target division, target city, material]>:
// removes an export (the game refuses a second export to the same warehouse, so changing the amount = cancel + export again).
// One corporation action per script (20 GB); started via lib/corp-scripts.js runAction. Results -> data/corp/do-cancel-export-material.txt
/** @param {NS} ns */
export async function main(ns) {
  performCalls(ns, "cancel-export-material", ([sourceDivision, sourceCity, targetDivision, targetCity, material]) =>
    ns.corporation.cancelExportMaterial(sourceDivision, sourceCity, targetDivision, targetCity, material));
}
