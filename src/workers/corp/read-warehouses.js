// workers/corp/read-warehouses.js <JSON [{division, city}]>: started by services/corp/status.js (one corporation call per
// script, 10 GB each): size, used, smart supply -> data/corp/warehouses.txt. Cities without a warehouse are skipped.
/** @param {NS} ns */
export async function main(ns) {
  const places = /** @type {{division: string, city: CityName}[]} */ (JSON.parse(String(ns.args[0])));
  const warehouses = [];
  for (const { division, city } of places) {
    try {
      warehouses.push({ division, ...ns.corporation.getWarehouse(division, city) });
    } catch {
      // no warehouse in this city yet
    }
  }
  ns.write("data/corp/warehouses.txt", JSON.stringify(warehouses), "w");
}
