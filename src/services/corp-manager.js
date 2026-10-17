import { runCorporationManager } from "lib/corp-manager-core.js";
import { runAction, runReader } from "lib/corp-scripts.js";

const STATE_FILE = "data/corp-state.txt";

// corp-manager.js (home): the corporation's routine work (products, prices, tea and parties, Wilson/Advert, requests from
// the tools in tools/corp-*.js). Everything it does and every option is documented in lib/corp-manager-core.js.
// This is the worker version: it decides from the snapshot services/corp-status.js writes to data/corp-state.txt every
// ~20 s and runs every corporation call as a small worker script (RAM: ~3 GB, the workers need 11.6 / 21.6 GB each).
// services/corp-manager-direct.js is the version that reads the corporation API itself, no state file (needs ~115 GB).
// Usage: run services/corp-manager.js [--division all|tobacco,sicko] [--city Aevum] [--reinvest-minutes 30]
/** @param {NS} ns */
export async function main(ns) {
  await runCorporationManager(ns, {
    runAction,
    runReader,
    persistPriceMemory: true,
    readState: (/** @type {NS} */ ns) => {
      try {
        return JSON.parse(ns.read(STATE_FILE));
      } catch {
        return null;
      }
    },
  });
}
