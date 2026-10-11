const NAME_PREFIX = "cloud-";
const LOG_FILE = "data/server-buyer.txt";
const CHECK_INTERVAL_MS = 10_000;

// Port openers unlock existing RAM far cheaper than buying it, so their cost stays reserved
// until they are bought (dark web prices; TOR router bought in the city).
const TOR_ROUTER_COST = 200e3;
const PORT_OPENER_COSTS = { "BruteSSH.exe": 500e3, "FTPCrack.exe": 1.5e6, "relaySMTP.exe": 5e6, "HTTPWorm.exe": 30e6, "SQLInject.exe": 250e6 };

// Buys cloud servers (ns.cloud) for the controller, which picks them up like any rooted server.
//   - budget = (money - reserve for the next missing port opener) * --spend
//   - below the server limit: buy the largest power-of-two RAM the budget allows (>= --min-ram)
//   - at the limit: upgrade the smallest server to the largest size the budget allows
// Stops when every server is at the game's RAM limit. Log: data/server-buyer.txt
// flags: --spend <fraction of the budget per purchase, default 0.5>, --min-ram <GB, default 8>
/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  const flags = ns.flags([["spend", 0.5], ["min-ram", 8]]);
  const spendFraction = Number(flags.spend);
  const minRam = Number(flags["min-ram"]);
  const ramLimit = ns.cloud.getRamLimit();
  const serverLimit = ns.cloud.getServerLimit();
  const log = (/** @type {object} */ entry) => ns.write(LOG_FILE, JSON.stringify({ time: Date.now(), ...entry }) + "\n", "a");

  while (true) {
    const reserve = nextPortOpenerCost(ns);
    const budget = Math.max(0, ns.getServerMoneyAvailable("home") - reserve) * spendFraction;
    const owned = ns.cloud.getServerNames();

    if (owned.length < serverLimit) {
      const ram = largestAffordableRam(minRam, ramLimit, budget, (size) => ns.cloud.getServerCost(size));
      if (ram > 0) {
        const name = ns.cloud.purchaseServer(nextFreeName(owned), ram);
        if (name) {
          log({ event: "bought", name, ram, cost: ns.cloud.getServerCost(ram) });
          ns.toast(`Bought ${name} with ${ns.format.ram(ram)}`, "info", 5000);
        }
      }
    } else {
      const smallest = owned.reduce((a, b) => (ns.getServerMaxRam(a) <= ns.getServerMaxRam(b) ? a : b));
      const currentRam = ns.getServerMaxRam(smallest);
      if (currentRam >= ramLimit) {
        log({ event: "done", reason: "all servers at the RAM limit" });
        return;
      }
      const ram = largestAffordableRam(currentRam * 2, ramLimit, budget, (size) => ns.cloud.getServerUpgradeCost(smallest, size));
      if (ram > 0 && ns.cloud.upgradeServer(smallest, ram)) {
        log({ event: "upgraded", name: smallest, from: currentRam, to: ram });
      }
    }
    await ns.sleep(CHECK_INTERVAL_MS);
  }
}

/** Cost of the cheapest thing still missing on the way to all port openers (TOR first). @param {NS} ns */
function nextPortOpenerCost(ns) {
  if (!ns.hasTorRouter()) return TOR_ROUTER_COST;
  const missing = Object.entries(PORT_OPENER_COSTS).filter(([program]) => !ns.fileExists(program, "home"));
  return missing.length ? Math.min(...missing.map(([, cost]) => cost)) : 0;
}

/**
 * Largest power-of-two RAM between minRam and maxRam whose cost fits the budget, or 0.
 * @param {number} minRam @param {number} maxRam @param {number} budget @param {(ram: number) => number} costOf
 */
function largestAffordableRam(minRam, maxRam, budget, costOf) {
  for (let ram = maxRam; ram >= minRam; ram /= 2) if (costOf(ram) <= budget) return ram;
  return 0;
}

/** First unused name cloud-01, cloud-02, ... @param {string[]} owned */
function nextFreeName(owned) {
  for (let index = 1; ; index++) {
    const name = NAME_PREFIX + String(index).padStart(2, "0");
    if (!owned.includes(name)) return name;
  }
}
