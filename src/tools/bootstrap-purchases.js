import { appendLog } from "lib/log.js";

const LOG_FILE = "data/bootstrap-purchases.txt";
const CHECK_MS = 10_000;
// Buying order. Within a group the cheapest affordable item goes first; a later group starts only when the earlier one
// is complete, so money is not spent on convenience while a port opener or the darknet program is still missing.
/** @type {Parameters<NS["singularity"]["purchaseProgram"]>[0][][]} */
const PROGRAM_GROUPS = [
  ["BruteSSH.exe", "FTPCrack.exe", "relaySMTP.exe", "HTTPWorm.exe", "SQLInject.exe", "DarkscapeNavigator.exe"], // hacking + darknet API
  ["AutoLink.exe", "DeepscanV1.exe", "DeepscanV2.exe", "ServerProfiler.exe", "Formulas.exe"], // the rest
];

// bootstrap-purchases.js (home, Singularity API): buys what a fresh start needs, in this order:
//   1. TOR router
//   2. the port openers (BruteSSH, FTPCrack, relaySMTP, HTTPWorm, SQLInject) and DarkscapeNavigator.exe (darknet API)
//   3. AutoLink, DeepscanV1/V2, ServerProfiler, Formulas.exe
//   4. home RAM, then home cores, while one upgrade costs at most --home-fraction of your money
// Programs are lost on every augmentation install, so run it after each reset. Log: data/bootstrap-purchases.txt.
//   --wait                keep running and buy as the money comes in (ends when all programs are owned with --no-home,
//                         otherwise it keeps buying home upgrades until you stop it)
//   --keep <money>        never spend below this amount (default 0)
//   --home-fraction <f>   buy a home upgrade only if it costs at most this share of the money above --keep (default 0.25)
//   --no-home             skip the home RAM and core upgrades
// Usage: run tools/bootstrap-purchases.js [--wait] [--keep 1e6] [--no-home]
/** @param {NS} ns */
export async function main(ns) {
  const options = ns.flags([["wait", false], ["keep", 0], ["home-fraction", 0.25], ["no-home", false]]);
  const keep = Number(options.keep);
  const homeFraction = Number(options["home-fraction"]);
  const log = (/** @type {string} */ details) => { ns.print(details); appendLog(ns, LOG_FILE, "buy", details); };
  ns.disableLog("ALL");
  const money = () => ns.getPlayer().money - keep;

  while (true) {
    let complete = true;
    if (!ns.hasTorRouter()) {
      complete = false;
      if (ns.singularity.purchaseTor()) log("TOR router");
    }
    if (ns.hasTorRouter()) {
      for (const group of PROGRAM_GROUPS) {
        const missing = group
          .map((program) => ({ program, cost: ns.singularity.getDarkwebProgramCost(program) }))
          .filter((item) => item.cost > 0) // 0 = owned, -1 = no TOR
          .sort((a, b) => a.cost - b.cost);
        for (const { program, cost } of missing) {
          if (cost <= money() && ns.singularity.purchaseProgram(program)) {
            log(`${program} for $${ns.format.number(cost)}`);
          }
        }
        if (group.some((program) => ns.singularity.getDarkwebProgramCost(program) > 0)) { complete = false; break; }
      }
    }
    if (complete && !options["no-home"]) {
      // each upgrade makes the next one more expensive; stop at the first one that is too dear
      while (ns.singularity.getUpgradeHomeRamCost() <= money() * homeFraction && ns.singularity.upgradeHomeRam()) log(`home RAM to ${ns.getServerMaxRam("home")} GB`);
      while (ns.singularity.getUpgradeHomeCoresCost() <= money() * homeFraction && ns.singularity.upgradeHomeCores()) log("home cores +1");
      complete = false; // home upgrades never end: with --wait the loop keeps buying them as money grows
    }
    if (!options.wait || complete) break;
    await ns.sleep(CHECK_MS);
  }
  const owned = PROGRAM_GROUPS.flat().filter((program) => ns.fileExists(program, "home"));
  ns.tprint(`TOR ${ns.hasTorRouter() ? "yes" : "NO"}; programs: ${owned.join(", ") || "none"}; missing: ${PROGRAM_GROUPS.flat().filter((program) => !owned.includes(program)).join(", ") || "none"}`);
}
