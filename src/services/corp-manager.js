import { runCorporationManager } from "lib/corp-manager-core.js";

// corp-manager.js (home): the corporation's routine work (products, prices, tea and parties, Wilson/Advert, staffing, requests
// from the tools in tools/corp-*.js). Logic and every option: lib/corp-manager-core.js.
// It reads the corporation from the API in its own process every round (lib/corp-direct.js): no state file, no reader scripts.
// Actions are small workers (workers/corp-do-*.js, 21.6 GB each, run one at a time) because all 20 action calls in one
// script would need ~510 GB; they answer through a port. Requests from tools still come through data/corp-requests.txt.
// RAM: ~115 GB (the corporation read calls: 11 x 10 GB) plus room for one action worker.
// Dashboard: it does not feed it; run services/corp-status.js next to it if you want the corporation panel.
// Usage: run services/corp-manager.js [--division all|tobacco,sicko] [--city Aevum] [--reinvest-minutes 30]
/** @param {NS} ns */
export async function main(ns) {
  await runCorporationManager(ns);
}
