import { scanAll } from "lib/net.js";
import { countOpeners, tryRoot, pickTarget } from "lib/targets.js";
import { TARGET_PORT } from "w/hgw.js";

const WORKER = "w/hgw.js";
const STATE = "data/state.txt";

// Early-game orchestrator (superseded by bin/ctl.js, kept for comparison).
// Meant to run on a rooted server, not home. args: [fixed target]
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

    const best = ns.args[0] ? String(ns.args[0]) : pickTarget(ns, rooted);
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
