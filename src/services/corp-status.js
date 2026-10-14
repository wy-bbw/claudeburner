import { appendLog } from "lib/log.js";
import { runReader } from "lib/corp-scripts.js";

const STATE_FILE = "data/corp-state.txt";
const HISTORY_FILE = "data/corp-history.txt";
const LOG_FILE = "data/corp-status.txt";
const INTERVAL_MS = 20_000;
// Researches the product services act on (services/corp-products.js turns Market-TA.II on for every product).
const WATCHED_RESEARCH = ["Market-TA.I", "Market-TA.II"];

// corp-status.js (home): every 20 s collects the corporation's state for the dashboard and the corporation services
// into data/corp-state.txt (JSON) and appends {t, funds, revenue, expenses, valuation} to data/corp-history.txt.
// Every corporation call costs 10 GB, so each one lives in its own reader script (workers/corp-read-*.js, ~11.6 GB)
// that this service starts one after another (lib/corp-scripts.js). Readers write data/corp/*.txt.
/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  let lastProblem = "";
  while (true) {
    let problem = "";
    if (!ns.corporation.hasCorporation()) problem = "no corporation yet";
    else {
      try {
        collect(ns, await readAll(ns));
      } catch (error) {
        problem = String(error);
      }
    }
    if (problem && problem !== lastProblem) appendLog(ns, LOG_FILE, "problem", problem);
    lastProblem = problem;
    await ns.sleep(INTERVAL_MS);
  }
}

/**
 * Runs the readers in order; each later one gets the divisions and cities the earlier ones found. The materials and
 * products readers wait for a SALE state first, so their sales data is from after readStartTime.
 * @param {NS} ns
 */
async function readAll(ns) {
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

/** @param {NS} ns @param {Awaited<ReturnType<typeof readAll>>} state */
function collect(ns, state) {
  const time = Date.now();
  ns.write(STATE_FILE, JSON.stringify({ time, ...state }), "w");
  const { funds, revenue, expenses, valuation } = state.corporation;
  ns.write(HISTORY_FILE, JSON.stringify({ t: time, funds, revenue, expenses, valuation }) + "\n", "a");
}
