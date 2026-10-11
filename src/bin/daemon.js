import { scanAll } from "lib/net.js";
import { TARGET_PORT } from "w/hgw.js";

const WORKER = "w/hgw.js";
const STATE = "data/state.txt";

// Early-game orchestrator. Meant to run on a rooted server, not home.
// Every tick: root what we can, pick a target, fill free RAM with workers,
// publish a state snapshot to home for the bridge.
/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  const self = ns.getHostname();
  const workerRam = ns.getScriptRam(WORKER, "home");
  let target = "";

  while (true) {
    const hosts = [...scanAll(ns).keys()].filter((h) => h !== "home");
    const openers = countOpeners(ns);
    for (const h of hosts) tryRoot(ns, h, openers);
    const rooted = hosts.filter((h) => ns.hasRootAccess(h));

    const best = pickTarget(ns, rooted);
    if (best && best !== target) {
      target = best;
      ns.clearPort(TARGET_PORT);
      ns.writePort(TARGET_PORT, target);
      ns.print(`target -> ${target}`);
    }

    let threads = 0;
    for (const h of rooted) {
      const free = ns.getServerMaxRam(h) - ns.getServerUsedRam(h);
      const n = Math.floor(free / workerRam);
      if (n < 1) continue;
      if (h !== self) ns.scp([WORKER], h, "home");
      if (ns.exec(WORKER, h, n)) threads += n;
    }

    const state = {
      time: Date.now(),
      hacking: ns.getHackingLevel(),
      money: ns.getServerMoneyAvailable("home"),
      openers,
      target,
      newWorkerThreads: threads,
      rooted: rooted.map((h) => ({ host: h, ram: ns.getServerMaxRam(h), used: ns.getServerUsedRam(h) })),
    };
    ns.write(STATE, JSON.stringify(state), "w");
    if (self !== "home") ns.scp(STATE, "home", self);

    await ns.sleep(10000);
  }
}

/** @param {NS} ns */
function countOpeners(ns) {
  return ["BruteSSH.exe", "FTPCrack.exe", "relaySMTP.exe", "HTTPWorm.exe", "SQLInject.exe"]
    .filter((f) => ns.fileExists(f, "home")).length;
}

/** @param {NS} ns @param {string} h @param {number} openers */
function tryRoot(ns, h, openers) {
  if (ns.hasRootAccess(h) || ns.getServerNumPortsRequired(h) > openers) return;
  if (ns.fileExists("BruteSSH.exe", "home")) ns.brutessh(h);
  if (ns.fileExists("FTPCrack.exe", "home")) ns.ftpcrack(h);
  if (ns.fileExists("relaySMTP.exe", "home")) ns.relaysmtp(h);
  if (ns.fileExists("HTTPWorm.exe", "home")) ns.httpworm(h);
  if (ns.fileExists("SQLInject.exe", "home")) ns.sqlinject(h);
  ns.nuke(h);
  ns.print(`rooted ${h}`);
}

// Classic heuristic: most max-money per unit of min-security, among servers
// whose required level is at most half ours (high hack chance, fast ops).
/** @param {NS} ns @param {string[]} rooted */
function pickTarget(ns, rooted) {
  const lvl = ns.getHackingLevel();
  let best = "", bestScore = 0;
  for (const h of rooted) {
    const req = ns.getServerRequiredHackingLevel(h);
    if (req > Math.max(1, lvl / 2)) continue;
    const score = ns.getServerMaxMoney(h) / ns.getServerMinSecurityLevel(h);
    if (score > bestScore) { best = h; bestScore = score; }
  }
  return best;
}
