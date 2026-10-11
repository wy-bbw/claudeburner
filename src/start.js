import { scanAll } from "lib/net.js";
import { countOpeners, tryRoot } from "lib/targets.js";

const CONTROLLER = "services/controller.js";
const METRICS = "services/metrics.js";
const AGENT = "agent.js";

// Cold start after any reset (augmentation install or new BitNode), fits an 8 GB home:
//   1. root every server the current port openers allow
//   2. start the controller on the biggest rooted server it fits on
//   3. start the metrics sampler on home if home has room for it next to the agent
//   4. hand over to agent.js via spawn, which frees this script's RAM first
// Usage: run start.js [controller flags, e.g. --rep 0.25]
// RAM: uses ps/exec instead of scriptRunning/run (1 GB each) to stay under 8 GB.
/** @param {NS} ns */
export async function main(ns) {
  const isRunning = (/** @type {string} */ script, /** @type {string} */ host) => ns.ps(host).some((p) => p.filename === script);
  const openers = countOpeners(ns);
  const hosts = [...scanAll(ns).keys()].filter((h) => h !== "home");
  for (const h of hosts) tryRoot(ns, h, openers);

  const controllerRam = ns.getScriptRam(CONTROLLER, "home");
  const running = hosts.find((h) => isRunning(CONTROLLER, h));
  if (running) ns.tprint(`controller already running on ${running}`);
  else {
    const host = hosts
      .filter((h) => ns.hasRootAccess(h) && ns.getServerMaxRam(h) - ns.getServerUsedRam(h) >= controllerRam)
      .sort((a, b) => ns.getServerMaxRam(b) - ns.getServerMaxRam(a))[0];
    if (!host) ns.tprint("no rooted server has room for the controller yet");
    else {
      ns.scp(ns.ls("home", ".js"), host, "home");
      const pid = ns.exec(CONTROLLER, host, 1, ...ns.args);
      ns.tprint(`controller on ${host}: ${pid ? "started" : "FAILED"} (${openers} port openers)`);
    }
  }

  // Leave room for the agent; metrics is optional.
  const homeFree = ns.getServerMaxRam("home") - ns.getServerUsedRam("home");
  if (!isRunning(METRICS, "home") && homeFree >= ns.getScriptRam(AGENT, "home") + ns.getScriptRam(METRICS, "home")) {
    ns.exec(METRICS, "home");
  }

  if (isRunning(AGENT, "home")) return;
  ns.tprint("handing over to agent.js");
  ns.spawn(AGENT, { spawnDelay: 100 });
}
