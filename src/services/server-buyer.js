import { appendLog } from "lib/log.js";

const NAME_PREFIX = "cloud-";
const LOG_FILE = "data/server-buyer.txt";
const CHECK_INTERVAL_MS = 10_000;
const CONTROLLER_STATE_FILE = "data/state.txt";
const MAX_FREE_SHARE_TO_BUY = 0.1; // buy only when less than 10% of the controller's thread slots are free

// Port openers that unlock RAM cheaper than cloud servers ($55k/GB). Measured in round 1:
// BruteSSH ~$4k/GB, FTPCrack ~$7k, relaySMTP ~$6k, HTTPWorm ~$43k (plus new targets).
// SQLInject (~$215k/GB) is not on the list: past HTTPWorm, servers are the cheaper RAM.
const CHEAPER_THAN_SERVERS = ["BruteSSH.exe", "FTPCrack.exe", "relaySMTP.exe", "HTTPWorm.exe"];

// Buys cloud servers (ns.cloud) for the controller, which picks them up like any rooted server.
//   - only after the player owns TOR and every port opener cheaper per GB than servers
//     (buying programs needs the Singularity API / SF4, so the player does that by hand)
//   - only while the controller has < 10% free thread slots (more RAM doesn't help otherwise)
//   - budget = money * --spend
//   - below the server limit: buy the largest power-of-two RAM the budget allows (>= --min-ram)
//   - at the limit: upgrade the smallest server to the largest size the budget allows
// Stops when every server is at the game's RAM limit. Log (readable lines): data/server-buyer.txt
// flags: --spend <fraction of the budget per purchase, default 0.5>, --min-ram <GB, default 8>
/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  const flags = ns.flags([["spend", 0.5], ["min-ram", 8]]);
  const spendFraction = Number(flags.spend);
  const minRam = Number(flags["min-ram"]);
  const ramLimit = ns.cloud.getRamLimit();
  const serverLimit = ns.cloud.getServerLimit();
  const log = (/** @type {string} */ event, /** @type {string} */ details) => appendLog(ns, LOG_FILE, event, details);

  while (true) {
    // Only buy RAM when the controller actually runs short of it (early in a round the targets,
    // not the RAM, are the bottleneck). The controller's snapshot is on home: reading it is free.
    if (!cheaperPortOpenersOwned(ns) || controllerFreeShare(ns) > MAX_FREE_SHARE_TO_BUY) {
      await ns.sleep(CHECK_INTERVAL_MS);
      continue;
    }
    const budget = ns.getServerMoneyAvailable("home") * spendFraction;
    const owned = ns.cloud.getServerNames();

    if (owned.length < serverLimit) {
      const ram = largestAffordableRam(minRam, ramLimit, budget, (size) => ns.cloud.getServerCost(size));
      if (ram > 0) {
        const name = ns.cloud.purchaseServer(nextFreeName(owned), ram);
        if (name) {
          log("bought", `${name} with ${ns.format.ram(ram)} for $${ns.format.number(ns.cloud.getServerCost(ram))}`);
          ns.toast(`Bought ${name} with ${ns.format.ram(ram)}`, "info", 5000);
        }
      }
    } else {
      const smallest = owned.reduce((a, b) => (ns.getServerMaxRam(a) <= ns.getServerMaxRam(b) ? a : b));
      const currentRam = ns.getServerMaxRam(smallest);
      if (currentRam >= ramLimit) {
        log("done", "all servers at the RAM limit");
        return;
      }
      const ram = largestAffordableRam(currentRam * 2, ramLimit, budget, (size) => ns.cloud.getServerUpgradeCost(smallest, size));
      if (ram > 0 && ns.cloud.upgradeServer(smallest, ram)) {
        log("upgraded", `${smallest} from ${ns.format.ram(currentRam)} to ${ns.format.ram(ram)}`);
      }
    }
    await ns.sleep(CHECK_INTERVAL_MS);
  }
}

/** Share of the controller's thread slots that are free (1 if there is no recent snapshot). @param {NS} ns */
function controllerFreeShare(ns) {
  try {
    const snapshot = JSON.parse(ns.read(CONTROLLER_STATE_FILE));
    if (Date.now() - snapshot.time > 60_000 || !snapshot.threads?.total) return 1;
    return snapshot.threads.free / snapshot.threads.total;
  } catch {
    return 1;
  }
}

/** True once TOR and every port opener that is cheaper RAM than servers are owned. @param {NS} ns */
function cheaperPortOpenersOwned(ns) {
  return ns.hasTorRouter() && CHEAPER_THAN_SERVERS.every((program) => ns.fileExists(program, "home"));
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
