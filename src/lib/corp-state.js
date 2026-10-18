// Collects the corporation's state with a "reader" function: runReader(ns, name, args) -> the data of one corporation call
// family. services/corp-status.js (dashboard) passes the worker-script version (lib/corp-scripts.js, results through files),
// services/corp-manager.js the in-process version (lib/corp-direct.js). The result has the shape of data/corp-state.txt.

// Researches the product services act on (services/corp-manager.js turns Market-TA.II on for every product).
const WATCHED_RESEARCH = ["Market-TA.I", "Market-TA.II"];

/**
 * Runs the readers in order; each later one gets the divisions and cities the earlier ones found. The materials and
 * products readers wait for a SALE state first, so their sales data is from after readStartTime.
 * @param {NS} ns @param {(ns: NS, name: string, args: string[]) => Promise<any>} runReader
 */
export async function readCorporationState(ns, runReader) {
  const readStartTime = Date.now();
  const corporation = await runReader(ns, "corporation", []);
  const offer = await runReader(ns, "investment", []);
  /** @type {{name: string, cities: string[], products: string[], makesProducts: boolean}[]} */
  const divisions = await runReader(ns, "divisions", [JSON.stringify(corporation.divisions)]);
  const places = divisions.flatMap((division) => division.cities.map((city) => ({ division: division.name, city })));
  const offices = await runReader(ns, "offices", [JSON.stringify(places)]);
  const warehouses = await runReader(ns, "warehouses", [JSON.stringify(places)]);
  const withWarehouse = warehouses.map((/** @type {{division: string, city: string}} */ warehouse) => ({ division: warehouse.division, city: warehouse.city }));
  const materials = withWarehouse.length ? await runReader(ns, "materials", [JSON.stringify(withWarehouse)]) : [];
  const productDivisions = divisions.filter((division) => division.makesProducts && division.cities.length);
  const withProducts = productDivisions.filter((division) => division.products.length)
    .map((division) => ({ division: division.name, cities: division.cities, names: division.products }));
  const products = withProducts.length ? await runReader(ns, "products", [JSON.stringify(withProducts)]) : [];
  const researchStatus = productDivisions.length
    ? await runReader(ns, "research-status", [JSON.stringify(productDivisions.map((division) => ({ division: division.name, names: WATCHED_RESEARCH })))])
    : [];
  const upgrades = await runReader(ns, "upgrades", []);
  return { readStartTime, corporation, offer, divisions, offices, warehouses, materials, products, researchStatus, upgrades };
}
