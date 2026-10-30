import { appendLog } from "lib/log.js";

const LOG_FILE = "data/hacknet.txt";
const TICK_MS = 1000;
const STATUS_INTERVAL_MS = 5 * 60_000;
const MAX_PURCHASES_PER_TICK = 200;
const SELL_FOR_MONEY = "Sell for Money";
const CORPORATION_FUNDS = "Sell for Corporation Funds";
const CORPORATION_RESEARCH = "Exchange for Corporation Research";
const MONEY_PER_HASH = 1e6 / 4; // Sell for Money: 4 hashes -> $1m, flat price
const CORPORATION_COST = 150e9; // own money needed to found a corporation outside BitNode 3
const SPEND_MODES = ["auto", "money", "corporation-funds", "corporation-research"];

// Hacknet manager for any BitNode: hacknet servers (BitNode 9 or SF9, they make hashes) or hacknet nodes (they
// make money directly).
//   - buys the upgrade (level, RAM, cores, new server/node) with the most production per dollar, as long as it
//     pays back within --payback-hours and leaves --reserve; hashes are valued at their Sell for Money price.
//     A new server counts together with its cheap first upgrades (newServerBundle, needs Formulas.exe).
//     24 h was the fastest way to $150b in a simulation of the BN9 start (2026-10-30: 12 h ~46 h, 24 h ~40 h,
//     48 h ~45 h, 72 h ~51 h); with a nearer install, use a payback below the time left until it.
//   - servers: spends the hashes by --spend
//       auto                  money until a corporation exists, then corporation-funds
//       money                 Sell for Money (4 hashes -> $1m)
//       corporation-funds     Sell for Corporation Funds ($1b, the n-th costs 100n hashes)
//       corporation-research  Exchange for Corporation Research (1k research per division, the n-th costs 200n hashes)
//     A corporation upgrade that costs more than the hash storage buys the cheapest cache upgrade; until that is
//     affordable the hashes are sold for money instead of overflowing.
// Production formulas from src/Hacknet/formulas (v3.0.1); the player and BitNode multiplier is measured from
// the current production. Without Formulas.exe a new server counts only its own production.
// Log (readable lines): data/hacknet.txt, a status line every 5 minutes.
// Usage: run services/hacknet/manager.js [--payback-hours 24] [--reserve 0] [--spend auto]
/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  const flags = ns.flags([["payback-hours", 24], ["reserve", 0], ["spend", "auto"]]);
  const paybackSeconds = Number(flags["payback-hours"]) * 3600;
  const reserve = Number(flags.reserve);
  const spend = String(flags.spend);
  if (!SPEND_MODES.includes(spend)) {
    ns.tprint(`--spend must be one of ${SPEND_MODES.join(", ")}`);
    return;
  }
  const isServers = ns.hacknet.maxNumNodes() !== Infinity;
  const log = (/** @type {string} */ event, /** @type {string} */ details) => appendLog(ns, LOG_FILE, event, details);
  const counters = newCounters();
  let lastStatusAt = Date.now(), corporationAffordableLogged = false;
  log("start", `${isServers ? "hacknet servers (hashes)" : "hacknet nodes (money)"}, payback ${flags["payback-hours"]} h, reserve $${ns.format.number(reserve)}, spend ${spend}`);

  while (true) {
    const hasCorporation = ns.corporation.hasCorporation();
    const mode = spend !== "auto" ? spend : hasCorporation ? "corporation-funds" : "money";

    for (let purchases = 0; purchases < MAX_PURCHASES_PER_TICK; purchases++) {
      const best = bestUpgrade(ns, isServers);
      if (!best || best.cost > ns.getServerMoneyAvailable("home") - reserve || best.paybackSeconds > paybackSeconds) break;
      if (!buy(ns, best)) break;
      counters.bought[best.kind]++;
      counters.moneySpent += best.cost;
      if (best.kind === "new") log("bought", `${isServers ? "server" : "node"} ${ns.hacknet.numNodes() - 1} for $${ns.format.number(best.cost)}`);
    }

    if (isServers) spendHashes(ns, mode, reserve, counters, log);

    if (mode === "money" && !hasCorporation && !corporationAffordableLogged && ns.getServerMoneyAvailable("home") >= CORPORATION_COST) {
      corporationAffordableLogged = true;
      log("money", `$${ns.format.number(ns.getServerMoneyAvailable("home"))}: enough to found the corporation`);
    }

    if (Date.now() - lastStatusAt >= STATUS_INTERVAL_MS) {
      log("status", statusLine(ns, isServers, mode, counters, (Date.now() - lastStatusAt) / 1000, bestUpgrade(ns, isServers)));
      Object.assign(counters, newCounters());
      lastStatusAt = Date.now();
    }
    await ns.sleep(TICK_MS);
  }
}

/**
 * moneyPerSecond and paybackSeconds of a new server or node are those of the bundle in newServerBundle.
 * @typedef {{ kind: "level" | "ram" | "cores" | "new", index: number, cost: number, moneyPerSecond: number, paybackSeconds: number }} Upgrade
 */

/** Purchases and hash spending since the last status line. */
function newCounters() {
  return {
    bought: { level: 0, ram: 0, cores: 0, new: 0, cache: 0 },
    moneySpent: 0,
    hashMoney: 0,
    corporationFunds: 0,
    corporationResearch: 0,
  };
}

/**
 * Production per second of one server (hashes) or node (money) without multipliers.
 * @param {boolean} isServers @param {number} level @param {number} ram @param {number} cores
 */
function baseProduction(isServers, level, ram, cores) {
  if (isServers) return 0.001 * level * Math.pow(1.07, Math.log2(ram)) * (1 + (cores - 1) / 5);
  return 1.5 * level * Math.pow(1.035, ram - 1) * ((cores + 5) / 6);
}

/**
 * The upgrade with the most added production (in $/s) per dollar, or null if nothing can be bought.
 * @param {NS} ns @param {boolean} isServers
 * @returns {Upgrade | null}
 */
function bestUpgrade(ns, isServers) {
  const count = ns.hacknet.numNodes();
  const value = isServers ? MONEY_PER_HASH : 1;
  /** @type {Upgrade[]} */
  const options = [];
  let multiplier = 1; // player and BitNode multiplier, measured on the first node that produces
  for (let index = 0; index < count; index++) {
    const stats = ns.hacknet.getNodeStats(index);
    const base = baseProduction(isServers, stats.level, stats.ram, stats.cores);
    const ramRatio = 1 - (stats.ramUsed ?? 0) / stats.ram;
    if (index === 0 && base > 0 && ramRatio > 0 && stats.production > 0) multiplier = stats.production / (base * ramRatio);
    const gain = (/** @type {number} */ level, /** @type {number} */ ram, /** @type {number} */ cores) =>
      (baseProduction(isServers, level, ram, cores) - base) * value;
    options.push(
      { kind: "level", index, cost: ns.hacknet.getLevelUpgradeCost(index), moneyPerSecond: gain(stats.level + 1, stats.ram, stats.cores), paybackSeconds: 0 },
      { kind: "ram", index, cost: ns.hacknet.getRamUpgradeCost(index), moneyPerSecond: gain(stats.level, stats.ram * 2, stats.cores), paybackSeconds: 0 },
      { kind: "cores", index, cost: ns.hacknet.getCoreUpgradeCost(index), moneyPerSecond: gain(stats.level, stats.ram, stats.cores + 1), paybackSeconds: 0 },
    );
  }
  /** @type {Upgrade | null} */
  let best = null;
  for (const option of options) {
    option.moneyPerSecond *= multiplier;
    option.paybackSeconds = option.cost / option.moneyPerSecond;
    if (!Number.isFinite(option.cost) || option.moneyPerSecond <= 0) continue;
    if (!best || option.moneyPerSecond / option.cost > best.moneyPerSecond / best.cost) best = option;
  }
  if (count < ns.hacknet.maxNumNodes()) {
    const cost = ns.hacknet.getPurchaseNodeCost();
    const threshold = best ? best.moneyPerSecond / best.cost : 0;
    const bundle = ns.fileExists("Formulas.exe", "home")
      ? newServerBundle(ns, isServers, value * multiplier, cost, threshold)
      : { cost, moneyPerSecond: baseProduction(isServers, 1, 1, 1) * value * multiplier };
    if (bundle.moneyPerSecond / bundle.cost > threshold) {
      best = { kind: "new", index: count, cost, moneyPerSecond: bundle.moneyPerSecond, paybackSeconds: bundle.cost / bundle.moneyPerSecond };
    }
  }
  return best;
}

/**
 * A new server or node valued together with the upgrades on it that beat `threshold` ($/s per dollar, the best
 * upgrade of the existing ones): a fresh one makes almost nothing, but its first upgrades are far cheaper than those
 * of the existing ones. Simulated from the BN9 start (2026-10-30, 24 h payback): $150b in ~40 h, against ~57 h when a
 * new server counted only its own production. Needs Formulas.exe for the upgrade costs of a server not bought yet.
 * @param {NS} ns @param {boolean} isServers @param {number} value $/s per unit of base production
 * @param {number} serverCost @param {number} threshold
 */
function newServerBundle(ns, isServers, value, serverCost, threshold) {
  const formulas = isServers ? ns.formulas.hacknetServers : ns.formulas.hacknetNodes;
  const costMultipliers = ns.getPlayer().mults;
  let level = 1, ram = 1, cores = 1;
  let cost = serverCost, moneyPerSecond = baseProduction(isServers, level, ram, cores) * value;
  for (let step = 0; step < 1000; step++) {
    const base = baseProduction(isServers, level, ram, cores);
    const options = [
      { cost: formulas.levelUpgradeCost(level, 1, costMultipliers.hacknet_node_level_cost), next: [level + 1, ram, cores] },
      { cost: formulas.ramUpgradeCost(ram, 1, costMultipliers.hacknet_node_ram_cost), next: [level, ram * 2, cores] },
      { cost: formulas.coreUpgradeCost(cores, 1, costMultipliers.hacknet_node_core_cost), next: [level, ram, cores + 1] },
    ].filter((option) => Number.isFinite(option.cost))
      .map((option) => ({ ...option, gain: (baseProduction(isServers, option.next[0], option.next[1], option.next[2]) - base) * value }));
    const upgrade = options.reduce((a, b) => (b.gain / b.cost > a.gain / a.cost ? b : a), options[0]);
    if (!upgrade || upgrade.gain / upgrade.cost < threshold) break;
    cost += upgrade.cost;
    moneyPerSecond += upgrade.gain;
    [level, ram, cores] = upgrade.next;
  }
  return { cost, moneyPerSecond };
}

/** @param {NS} ns @param {Upgrade} upgrade */
function buy(ns, upgrade) {
  switch (upgrade.kind) {
    case "level": return ns.hacknet.upgradeLevel(upgrade.index);
    case "ram": return ns.hacknet.upgradeRam(upgrade.index);
    case "cores": return ns.hacknet.upgradeCore(upgrade.index);
    case "new": return ns.hacknet.purchaseNode() !== -1;
  }
}

/**
 * Spends the stored hashes by mode (see the header).
 * @param {NS} ns @param {string} mode @param {number} reserve
 * @param {ReturnType<typeof newCounters>} counters @param {(event: string, details: string) => void} log
 */
function spendHashes(ns, mode, reserve, counters, log) {
  const sellAll = () => {
    const count = Math.floor(ns.hacknet.numHashes() / 4);
    if (count > 0 && ns.hacknet.spendHashes(SELL_FOR_MONEY, "", count)) counters.hashMoney += count * 1e6;
  };
  if (mode === "money") {
    sellAll();
    return;
  }
  const upgrade = mode === "corporation-funds" ? CORPORATION_FUNDS : CORPORATION_RESEARCH;
  while (ns.hacknet.numHashes() >= ns.hacknet.hashCost(upgrade) && ns.hacknet.spendHashes(upgrade)) {
    if (upgrade === CORPORATION_FUNDS) counters.corporationFunds++;
    else counters.corporationResearch++;
  }
  if (ns.hacknet.hashCost(upgrade) <= ns.hacknet.hashCapacity()) return;
  // The next corporation upgrade does not fit into the storage: grow the cheapest cache.
  let cheapest = -1, cheapestCost = Infinity;
  for (let index = 0; index < ns.hacknet.numNodes(); index++) {
    const cost = ns.hacknet.getCacheUpgradeCost(index);
    if (cost < cheapestCost) [cheapest, cheapestCost] = [index, cost];
  }
  if (cheapest >= 0 && cheapestCost <= ns.getServerMoneyAvailable("home") - reserve && ns.hacknet.upgradeCache(cheapest)) {
    counters.bought.cache++;
    counters.moneySpent += cheapestCost;
    log("cache", `server ${cheapest} for $${ns.format.number(cheapestCost)}, storage ${ns.format.number(ns.hacknet.hashCapacity())} hashes, next ${upgrade} costs ${ns.format.number(ns.hacknet.hashCost(upgrade))}`);
  } else {
    sellAll();
  }
}

/**
 * @param {NS} ns @param {boolean} isServers @param {string} mode
 * @param {ReturnType<typeof newCounters>} counters @param {number} seconds since the last status line
 * @param {Upgrade | null} next the upgrade the manager buys next
 */
function statusLine(ns, isServers, mode, counters, seconds, next) {
  let production = 0;
  for (let index = 0; index < ns.hacknet.numNodes(); index++) production += ns.hacknet.getNodeStats(index).production;
  const bought = Object.entries(counters.bought).filter(([, count]) => count > 0).map(([kind, count]) => `${kind} ${count}`).join(" ") || "nothing";
  const parts = [
    `${ns.hacknet.numNodes()} ${isServers ? "servers" : "nodes"}`,
    isServers ? `${ns.format.number(production)} hashes/s (= $${ns.format.number(production * MONEY_PER_HASH)}/s sold)` : `$${ns.format.number(production)}/s`,
    `bought ${bought} for $${ns.format.number(counters.moneySpent)}`,
    next ? `next ${next.kind} on ${next.index}: $${ns.format.number(next.cost)}, payback ${(next.paybackSeconds / 3600).toFixed(2)} h` : "next: nothing left",
  ];
  if (isServers) {
    parts.push(`spend ${mode}: sold $${ns.format.number(counters.hashMoney)} ($${ns.format.number(counters.hashMoney / seconds)}/s), corporation funds ${counters.corporationFunds}, research ${counters.corporationResearch}`);
    parts.push(`hashes ${ns.format.number(ns.hacknet.numHashes())}/${ns.format.number(ns.hacknet.hashCapacity())}`);
  }
  return parts.join(" | ");
}
