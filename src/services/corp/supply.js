import { appendLog } from "lib/log.js";
import { runAction, runReader } from "lib/corp-scripts.js";
import { SECONDS_PER_CYCLE, planSupply } from "lib/corp-supply.js";

// services/corp/supply.js (home): buys every division's input materials with buy orders, a replacement for the Smart Supply unlock
// (~$26b saved at the start; logic and its source in lib/corp-supply.js). Once per market cycle, after the SALE state, it
// reads the stock and sets each input's buy order for the next PURCHASE state; imports (exports from other divisions)
// arrive after production and are counted once, as stock (like Smart Supply's "leftovers"). Warehouses with the real Smart Supply on are left alone (the game
// ignores buy orders of required materials there).
// Buy orders stay set when the script stops: run it with --stop to set them all to 0.
// Needs the corporation workers (materials, warehouses readers 11.6 GB; buy-material 21.6 GB), one at a time.
// Log: data/corp-supply.txt (a summary every few minutes, failures).
// Usage: run services/corp/supply.js [--dry-run] [--stop]

const LOG_FILE = "data/corp-supply.txt";
const REFRESH_CYCLES = 30;
const SUMMARY_CYCLES = 18;

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  const flags = ns.flags([["dry-run", false], ["stop", false]]);
  const dryRun = Boolean(flags["dry-run"]);
  const log = (/** @type {string} */ event, /** @type {string} */ text) => { ns.print(text); appendLog(ns, LOG_FILE, event, text); };

  /** @type {{division: string, city: string, required: Record<string, number>}[]} */
  let places = [];
  /** @type {Record<string, number>} */
  let sizes = {};
  /** Production estimate per "division|city". @type {Map<string, number>} */
  const estimates = new Map();

  for (let cycle = 0; ; cycle++) {
    if (cycle % REFRESH_CYCLES === 0) ({ places, sizes } = await readPlaces(ns));
    if (flags.stop) {
      const calls = places.flatMap((place) => Object.keys(place.required).map((material) => [place.division, place.city, material, 0]));
      if (calls.length) await reportAction(ns, log, calls);
      ns.tprint(`buy orders of ${calls.length} inputs set to 0`);
      return;
    }
    if (!places.length) { await ns.sleep(SECONDS_PER_CYCLE * 1000); continue; }

    const where = JSON.stringify(places.map(({ division, city }) => ({ division, city })));
    const materials = await runReader(ns, "materials", [where]);  // returns right after a SALE state
    const warehouses = await runReader(ns, "warehouses", [where]);
    /** @type {unknown[][]} */
    const calls = [];
    /** @type {string[]} */
    const summary = [];
    for (const place of places) {
      const warehouse = warehouses.find((/** @type {{division: string, city: string}} */ entry) => entry.division === place.division && entry.city === place.city);
      if (!warehouse || warehouse.smartSupplyEnabled) continue;
      const rows = materials.filter((/** @type {{division: string, city: string}} */ entry) => entry.division === place.division && entry.city === place.city);
      const key = `${place.division}|${place.city}`;
      const plan = planSupply(place.required, sizes, warehouse, rows, estimates.get(key) ?? 0);
      estimates.set(key, plan.estimate);
      for (const order of plan.orders) calls.push([place.division, place.city, order.material, order.rate]);
      summary.push(`${key}: production ${plan.actual.toFixed(1)}/s${plan.short ? " SHORT" : ""}, buy ${plan.orders.map((order) => `${order.material} ${order.rate.toFixed(1)}/s`).join(", ")}`);
    }
    if (dryRun) { for (const line of summary) log("plan", line); continue; }
    if (calls.length) await reportAction(ns, log, calls);
    if (cycle % SUMMARY_CYCLES === 0) for (const line of summary) log("supply", line);
  }
}

/** Every division-city with a warehouse, the inputs its industry needs and the inputs' sizes. @param {NS} ns */
async function readPlaces(ns) {
  const corporation = await runReader(ns, "corporation", []);
  const names = /** @type {string[]} */ (corporation.divisions ?? []);
  if (!names.length) return { places: [], sizes: {} };
  const divisions = await runReader(ns, "divisions", [JSON.stringify(names)]);
  const industries = [...new Set(divisions.map((/** @type {{industry: string}} */ division) => division.industry))];
  const data = await runReader(ns, "industry-data", [JSON.stringify(industries)]);
  /** @type {{division: string, city: string, required: Record<string, number>}[]} */
  const all = divisions.flatMap((/** @type {{name: string, industry: string, cities: string[]}} */ division) =>
    division.cities.map((city) => ({ division: division.name, city, required: data.industries[division.industry].requiredMaterials ?? {} })))
    .filter((/** @type {{required: Record<string, number>}} */ place) => Object.keys(place.required).length);
  const warehouses = all.length ? await runReader(ns, "warehouses", [JSON.stringify(all.map(({ division, city }) => ({ division, city })))]) : [];
  const places = all.filter((place) => warehouses.some((/** @type {{division: string, city: string}} */ entry) => entry.division === place.division && entry.city === place.city));
  return { places, sizes: data.sizes };
}

/** @param {NS} ns @param {(event: string, text: string) => void} log @param {unknown[][]} calls */
async function reportAction(ns, log, calls) {
  const results = await runAction(ns, "buy-material", calls);
  for (const failure of results.filter((result) => !result.ok).slice(0, 5)) log("failed", `${JSON.stringify(failure.args)}: ${failure.error}`);
}
