import { appendLog } from "lib/log.js";

const STATE_FILE = "data/corp-state.txt";
const HISTORY_FILE = "data/corp-history.txt";
const LOG_FILE = "data/corp-status.txt";
const INTERVAL_MS = 20_000;

// corp-status.js (home): every 20 s collects the corporation's state for the dashboard into data/corp-state.txt
// (JSON) and appends {t, funds, revenue, expenses, valuation} to data/corp-history.txt (JSON lines).
// Every corporation call costs 10 GB, so each one lives in its own reader script (workers/corp-read-*.js, ~11.6 GB)
// that this service starts one after another: only one reader needs RAM at a time. Readers write data/corp/*.txt.
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

/** Runs the readers in order; each later one gets the divisions and cities the earlier ones found. @param {NS} ns */
async function readAll(ns) {
  const corporation = await runReader(ns, "corporation", []);
  const offer = await runReader(ns, "investment", []);
  const divisions = await runReader(ns, "divisions", [JSON.stringify(corporation.divisions)]);
  const places = divisions.flatMap((/** @type {{name: string, cities: string[]}} */ division) =>
    division.cities.map((city) => ({ division: division.name, city })));
  const offices = await runReader(ns, "offices", [JSON.stringify(places)]);
  const warehouses = await runReader(ns, "warehouses", [JSON.stringify(places)]);
  const withWarehouse = warehouses.map((/** @type {{division: string, city: string}} */ warehouse) => ({ division: warehouse.division, city: warehouse.city }));
  const materials = withWarehouse.length ? await runReader(ns, "materials", [JSON.stringify(withWarehouse)]) : [];
  return { corporation, offer, divisions, offices, warehouses, materials };
}

/**
 * Starts workers/corp-read-<name>.js on home, waits for it and returns what it wrote.
 * @param {NS} ns @param {string} name @param {string[]} args
 */
async function runReader(ns, name, args) {
  const script = `workers/corp-read-${name}.js`;
  const needed = ns.getScriptRam(script, "home");
  const free = ns.getServerMaxRam("home") - ns.getServerUsedRam("home");
  if (needed > free) throw new Error(`not enough free RAM on home for ${script}: needs ${needed} GB, ${free.toFixed(1)} GB free`);
  const pid = ns.run(script, 1, ...args);
  if (!pid) throw new Error(`could not start ${script}`);
  while (ns.isRunning(pid)) await ns.sleep(50);
  return JSON.parse(ns.read(`data/corp/${name}.txt`));
}

/** @param {NS} ns @param {Awaited<ReturnType<typeof readAll>>} state */
function collect(ns, state) {
  const time = Date.now();
  ns.write(STATE_FILE, JSON.stringify({ time, ...state }), "w");
  const { funds, revenue, expenses, valuation } = state.corporation;
  ns.write(HISTORY_FILE, JSON.stringify({ t: time, funds, revenue, expenses, valuation }) + "\n", "a");
}
