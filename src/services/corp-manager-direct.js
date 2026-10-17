import { runCorporationManager } from "lib/corp-manager-core.js";
import { runReader, readStateDirect } from "lib/corp-direct.js";
import { runActionByPort } from "lib/corp-scripts.js";

// corp-manager-direct.js (home): the same manager as services/corp-manager.js (logic in lib/corp-manager-core.js, all
// options documented there), but it reads the corporation from the game itself, every round: no data/corp-state.txt, no
// services/corp-status.js, no reader scripts, no price-memory file (calibrations live in RAM and are re-learned after a
// restart). Actions are still the small workers (workers/corp-do-*.js, 21.6 GB each, run one at a time) because all
// 20 action calls in one script would need ~510 GB; they answer through a port, not a file.
// What it still reads from files: the requests queued by tools/corp-*.js (data/corp-requests.txt: that is how a tool
// reaches the manager). It still writes its log (data/corp-manager.txt) and the price report (data/corp-prices.txt).
// RAM: ~115 GB (the corporation read calls: 11 x 10 GB). Do not run it together with services/corp-manager.js.
// Dashboard: it does not feed it; run services/corp-status.js next to it if you want the corporation panel.
// Usage: run services/corp-manager-direct.js [--division all|tobacco,sicko] [--city Aevum] [--reinvest-minutes 30]
/** @param {NS} ns */
export async function main(ns) {
  await runCorporationManager(ns, {
    runAction: runActionByPort,
    runReader,
    persistPriceMemory: false,
    readState: readStateDirect,
  });
}
