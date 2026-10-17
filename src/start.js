import { scanAll } from "lib/net.js";
import { countOpeners, tryRoot } from "lib/targets.js";

const CONTROLLER = "services/controller.js";
const BATCHER = "services/batcher.js"; // replaces the controller once Formulas.exe is owned
const AGENT = "agent.js";
// Optional services on home, started in this order while home has room next to the agent.
// services/server-buyer.js is left out on purpose (2026-10-16): bought servers are of little value in BitNode 4 and the money is
// needed elsewhere. Start it by hand (run services/server-buyer.js) if you want it again.
const HOME_SERVICES = ["services/metrics.js", "services/coding-contracts.js", "services/darknet-orchestrator.js"];

// Cold start after any reset (augmentation install or new BitNode), fits an 8 GB home:
//   1. root every server the current port openers allow
//   2. start the optional home services that fit (before the controller fills home with workers)
//   3. start the hacking service on the biggest rooted server it fits on: services/batcher.js with
//      Formulas.exe, else services/controller.js. A running controller is replaced by the batcher once
//      Formulas.exe is owned (the controller runs this script itself when it sees the file); its jobs
//      finish on their own, the batcher leaves those targets alone until then.
//   4. hand over to agent.js via spawn, which frees this script's RAM first
// Usage: run start.js [hacking service flags, e.g. --rep 0.2]
// RAM: uses ps/exec/kill instead of scriptRunning/run (1 GB each) to stay under 8 GB.
/** @param {NS} ns */
export async function main(ns) {
  const processOf = (/** @type {string} */ script, /** @type {string} */ host) => ns.ps(host).find((process) => process.filename === script);
  const portOpeners = countOpeners(ns);
  const hosts = [...scanAll(ns).keys()].filter((host) => host !== "home");
  for (const host of hosts) tryRoot(ns, host, portOpeners);

  // Keep room for the agent (and for this script until it hands over).
  let homeFree = ns.getServerMaxRam("home") - ns.getServerUsedRam("home") - ns.getScriptRam(AGENT, "home");
  for (const service of HOME_SERVICES) {
    if (processOf(service, "home")) continue;
    const serviceRam = ns.getScriptRam(service, "home");
    if (homeFree < serviceRam) continue;
    if (ns.exec(service, "home")) homeFree -= serviceRam;
  }

  const hackingService = ns.fileExists("Formulas.exe", "home") ? BATCHER : CONTROLLER;
  const runningOn = (/** @type {string} */ script) => [...hosts, "home"].find((host) => processOf(script, host));
  const controllerHost = runningOn(CONTROLLER);
  if (hackingService === BATCHER && controllerHost) {
    ns.kill(/** @type {ProcessInfo} */ (processOf(CONTROLLER, controllerHost)).pid);
    ns.tprint(`Formulas.exe owned: stopped the controller on ${controllerHost}`);
  }
  const runningHost = runningOn(hackingService);
  if (runningHost) ns.tprint(`${hackingService} already running on ${runningHost}`);
  else {
    const serviceRam = ns.getScriptRam(hackingService, "home");
    const host = hosts
      .filter((candidate) => ns.hasRootAccess(candidate) && ns.getServerMaxRam(candidate) - ns.getServerUsedRam(candidate) >= serviceRam)
      .sort((a, b) => ns.getServerMaxRam(b) - ns.getServerMaxRam(a))[0];
    if (!host) ns.tprint(`no rooted server has room for ${hackingService} yet`);
    else {
      ns.scp(ns.ls("home", ".js"), host, "home");
      const pid = ns.exec(hackingService, host, 1, ...ns.args);
      ns.tprint(`${hackingService} on ${host}: ${pid ? "started" : "FAILED"} (${portOpeners} port openers)`);
    }
  }

  if (processOf(AGENT, "home")) return;
  ns.tprint("handing over to agent.js");
  ns.spawn(AGENT, { spawnDelay: 100 });
}
