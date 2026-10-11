import { scanAll } from "lib/net.js";
import { countOpeners, tryRoot } from "lib/targets.js";

const CONTROLLER = "services/controller.js";
const AGENT = "agent.js";
// Optional services on home, started in this order while home has room next to the agent.
const HOME_SERVICES = ["services/metrics.js", "services/coding-contracts.js", "services/server-buyer.js"];

// Cold start after any reset (augmentation install or new BitNode), fits an 8 GB home:
//   1. root every server the current port openers allow
//   2. start the optional home services that fit (before the controller fills home with workers)
//   3. start the controller on the biggest rooted server it fits on
//   4. hand over to agent.js via spawn, which frees this script's RAM first
// Usage: run start.js [controller flags, e.g. --rep 0.2]
// RAM: uses ps/exec instead of scriptRunning/run (1 GB each) to stay under 8 GB.
/** @param {NS} ns */
export async function main(ns) {
  const isRunning = (/** @type {string} */ script, /** @type {string} */ host) => ns.ps(host).some((process) => process.filename === script);
  const portOpeners = countOpeners(ns);
  const hosts = [...scanAll(ns).keys()].filter((host) => host !== "home");
  for (const host of hosts) tryRoot(ns, host, portOpeners);

  // Keep room for the agent (and for this script until it hands over).
  let homeFree = ns.getServerMaxRam("home") - ns.getServerUsedRam("home") - ns.getScriptRam(AGENT, "home");
  for (const service of HOME_SERVICES) {
    if (isRunning(service, "home")) continue;
    const serviceRam = ns.getScriptRam(service, "home");
    if (homeFree < serviceRam) continue;
    if (ns.exec(service, "home")) homeFree -= serviceRam;
  }

  const controllerRam = ns.getScriptRam(CONTROLLER, "home");
  const controllerHost = hosts.find((host) => isRunning(CONTROLLER, host));
  if (controllerHost) ns.tprint(`controller already running on ${controllerHost}`);
  else {
    const host = hosts
      .filter((candidate) => ns.hasRootAccess(candidate) && ns.getServerMaxRam(candidate) - ns.getServerUsedRam(candidate) >= controllerRam)
      .sort((a, b) => ns.getServerMaxRam(b) - ns.getServerMaxRam(a))[0];
    if (!host) ns.tprint("no rooted server has room for the controller yet");
    else {
      ns.scp(ns.ls("home", ".js"), host, "home");
      const pid = ns.exec(CONTROLLER, host, 1, ...ns.args);
      ns.tprint(`controller on ${host}: ${pid ? "started" : "FAILED"} (${portOpeners} port openers)`);
    }
  }

  if (isRunning(AGENT, "home")) return;
  ns.tprint("handing over to agent.js");
  ns.spawn(AGENT, { spawnDelay: 100 });
}
