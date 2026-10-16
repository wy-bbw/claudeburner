import { runAction } from "lib/corp-scripts.js";

// The corporation guide's export amount: exactly what the importer will use next cycle, minus what it still has.
const EXPORT_AMOUNT = "(IPROD+IINV/10)*(-1)";

// corp-exports.js: sets up the supply chain exports in every city both divisions share, from data/corp-state.txt
// (services/corp-status.js):
//   Agriculture Plants -> Chemical, Chemical Chemicals -> Agriculture, Agriculture Plants -> Tobacco,
//   Agriculture Food -> Restaurant (routes to a division that does not exist are skipped)
// and switches Smart Supply of every imported material to "leftovers": it then buys the need minus what is stored, and
// imports are stored before the next purchase. ("imports" subtracts only this cycle's imports and ignores the stock: when
// production falls short, imported material piles up, fills the warehouse and production falls further.)
// Existing exports to the same target are left alone, so it is safe to run again after adding cities or divisions.
// Usage: run tools/corp-exports.js [--agriculture food] [--chemical FSAB] [--tobacco tobacco] [--restaurant restaurant]
/** @param {NS} ns */
export async function main(ns) {
  const flags = ns.flags([["agriculture", "food"], ["chemical", "FSAB"], ["tobacco", "tobacco"], ["restaurant", "restaurant"]]);
  const state = JSON.parse(ns.read("data/corp-state.txt"));
  /** @type {Map<string, string[]>} */
  const citiesByDivision = new Map(state.divisions.map((/** @type {{name: string, cities: string[]}} */ division) => [division.name, division.cities]));
  // Only cities with a warehouse can store imports or exports.
  const withWarehouse = new Set(state.warehouses.map((/** @type {{division: string, city: string}} */ warehouse) => `${warehouse.division}/${warehouse.city}`));
  const routes = [
    { from: String(flags.agriculture), to: String(flags.chemical), material: "Plants" },
    { from: String(flags.chemical), to: String(flags.agriculture), material: "Chemicals" },
    { from: String(flags.agriculture), to: String(flags.tobacco), material: "Plants" },
    { from: String(flags.agriculture), to: String(flags.restaurant), material: "Food" },
  ];
  const exports = [], supplyOptions = [];
  for (const { from, to, material } of routes) {
    const cities = (citiesByDivision.get(from) ?? []).filter((city) => (citiesByDivision.get(to) ?? []).includes(city)
      && withWarehouse.has(`${from}/${city}`) && withWarehouse.has(`${to}/${city}`));
    if (!cities.length) ns.tprint(`${material} ${from} -> ${to}: no shared city with warehouses (division missing?)`);
    for (const city of cities) {
      const source = state.materials.find((/** @type {{division: string, city: string, name: string}} */ entry) =>
        entry.division === from && entry.city === city && entry.name === material);
      const existing = (source?.exports ?? []).some((/** @type {{division: string, city: string}} */ target) => target.division === to && target.city === city);
      if (!existing) exports.push([from, city, to, city, material, EXPORT_AMOUNT]);
      supplyOptions.push([to, city, material, "leftovers"]);
    }
  }
  for (const [action, calls] of /** @type {[string, unknown[][]][]} */ ([["export-material", exports], ["set-smart-supply-option", supplyOptions]])) {
    if (!calls.length) continue;
    const results = await runAction(ns, action, calls);
    const failures = results.filter((result) => !result.ok);
    ns.tprint(`${action}: ${results.length - failures.length}/${results.length} ok`);
    for (const failure of failures.slice(0, 5)) ns.tprint(`  failed ${JSON.stringify(failure.args)}: ${failure.error}`);
  }
}
