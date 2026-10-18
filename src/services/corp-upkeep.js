import { appendLog } from "lib/log.js";
import { runAction } from "lib/corp-scripts.js";
import { upkeepCalls } from "lib/corp-upkeep.js";

const STATE_FILE = "data/corp-state.txt";
const LOG_FILE = "data/corp-upkeep.txt";
const INTERVAL_MS = 5_000;

// corp-upkeep.js (home): only keeps employees happy - tea and parties for every office below max energy / morale - 2
// (lib/corp-upkeep.js), on each new data/corp-state.txt (services/corp-status.js). For running the corporation by hand;
// services/corp-manager.js does the same as part of its round (reading the API itself), so run one of the two, not both.
// Log (failures only): data/corp-upkeep.txt.
// Usage: run services/corp-upkeep.js
/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  let lastStateTime = 0;
  appendLog(ns, LOG_FILE, "start", "tea and parties only");
  while (true) {
    await ns.sleep(INTERVAL_MS);
    let state = null;
    try { state = JSON.parse(ns.read(STATE_FILE)); } catch { continue; }
    if (!state || state.time <= lastStateTime) continue;
    lastStateTime = state.time;
    const { teaCalls, partyCalls } = upkeepCalls(state.offices ?? []);
    for (const [action, calls] of /** @type {[string, unknown[][]][]} */ ([["buy-tea", teaCalls], ["throw-party", partyCalls]])) {
      if (!calls.length) continue;
      const results = await runAction(ns, action, calls);
      for (const failure of results.filter((result) => !result.ok)) appendLog(ns, LOG_FILE, "failed", `${action} ${JSON.stringify(failure.args)}: ${failure.error}`);
    }
  }
}
