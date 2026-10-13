// corp-read-materials.js <JSON [{division, city}]>: started by services/corp-status.js (one corporation call per
// script, 10 GB each): every material a warehouse holds, buys, produces or sells -> data/corp/materials.txt
/** @param {NS} ns */
export async function main(ns) {
  const places = /** @type {{division: string, city: CityName}[]} */ (JSON.parse(String(ns.args[0])));
  const materialNames = ns.corporation.getConstants().materialNames;
  const materials = [];
  for (const { division, city } of places) {
    for (const name of materialNames) {
      const material = ns.corporation.getMaterial(division, city, name);
      if (material.stored || material.buyAmount || material.productionAmount || material.actualSellAmount) {
        materials.push({ division, city, name, stored: material.stored, quality: material.quality, buyAmount: material.buyAmount,
          productionAmount: material.productionAmount, actualSellAmount: material.actualSellAmount, marketPrice: material.marketPrice });
      }
    }
  }
  ns.write("data/corp/materials.txt", JSON.stringify(materials), "w");
}
