// corp-read-products.js <JSON [{division, cities, names}]>: started by services/corp-status.js (one corporation call
// per script, 10 GB each): every product in every city -> data/corp/products.txt (one entry per product and city).
// Waits until the SALE state has just been processed, so `stored` is what the last sale left over: the pricing in
// services/corp-manager.js compares it with what was sold.
/** @param {NS} ns */
export async function main(ns) {
  const places = /** @type {{division: string, cities: CityName[], names: string[]}[]} */ (JSON.parse(String(ns.args[0])));
  while ((await ns.corporation.nextUpdate()) !== "SALE");
  const products = places.flatMap(({ division, cities, names }) => cities.flatMap((city) => names.map((name) => {
    const product = ns.corporation.getProduct(division, city, name);
    return {
      division, city, name, developmentProgress: product.developmentProgress, rating: product.rating,
      effectiveRating: product.effectiveRating, desiredSellAmount: product.desiredSellAmount,
      desiredSellPrice: product.desiredSellPrice, stored: product.stored, productionAmount: product.productionAmount,
      actualSellAmount: product.actualSellAmount, productionCost: product.productionCost,
      designInvestment: product.designInvestment, advertisingInvestment: product.advertisingInvestment,
    };
  })));
  ns.write("data/corp/products.txt", JSON.stringify(products), "w");
}
