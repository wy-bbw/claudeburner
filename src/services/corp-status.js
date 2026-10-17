import { appendLog } from "lib/log.js";
import { runReader } from "lib/corp-scripts.js";
import { readCorporationState } from "lib/corp-state.js";

const STATE_FILE = "data/corp-state.txt";
const HISTORY_FILE = "data/corp-history.txt";
const LOG_FILE = "data/corp-status.txt";
const INTERVAL_MS = 20_000;

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
        collect(ns, await readCorporationState(ns, runReader));
      } catch (error) {
        problem = String(error);
      }
    }
    if (problem && problem !== lastProblem) appendLog(ns, LOG_FILE, "problem", problem);
    lastProblem = problem;
    await ns.sleep(INTERVAL_MS);
  }
}

/** @param {NS} ns @param {Awaited<ReturnType<typeof readCorporationState>>} state */
function collect(ns, state) {
  const time = Date.now();
  ns.write(STATE_FILE, JSON.stringify({ time, ...state }), "w");
  const { funds, revenue, expenses, valuation } = state.corporation;
  ns.write(HISTORY_FILE, JSON.stringify({ t: time, funds, revenue, expenses, valuation }) + "\n", "a");
}
