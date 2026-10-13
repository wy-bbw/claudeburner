// corp-read-divisions.js <JSON array of division names>: started by services/corp-status.js (one corporation call
// per script, 10 GB each): awareness, popularity, research points, cities... -> data/corp/divisions.txt
// Copies named fields: serializing the whole object touches the deprecated `type` property and logs a warning.
/** @param {NS} ns */
export async function main(ns) {
  const names = /** @type {string[]} */ (JSON.parse(String(ns.args[0])));
  const divisions = names.map((name) => {
    const division = ns.corporation.getDivision(name);
    return {
      name: division.name, industry: division.industry, awareness: division.awareness, popularity: division.popularity,
      productionMult: division.productionMult, researchPoints: division.researchPoints, numAdVerts: division.numAdVerts,
      lastCycleRevenue: division.lastCycleRevenue, lastCycleExpenses: division.lastCycleExpenses,
      cities: division.cities, products: division.products, makesProducts: division.makesProducts, maxProducts: division.maxProducts,
    };
  });
  ns.write("data/corp/divisions.txt", JSON.stringify(divisions), "w");
}
