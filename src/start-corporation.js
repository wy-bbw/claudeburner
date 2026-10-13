const AGENT = "agent.js";
// Corporation services on home, started in this order. Each reader of corp-status.js needs ~11.6 GB while it runs.
const CORPORATION_SERVICES = ["services/corp-status.js"];

// start-corporation.js: the start for corporation BitNodes (BN3), instead of start.js. Starts the corporation services
// on home and hands over to agent.js, but no hacking service and no hacking-economy home services (server-buyer,
// metrics, darknet-orchestrator): home RAM stays free for the corporation scripts, whose calls cost 10-20 GB each.
// Run start.js as well only if you want hacking experience (it starts those home services again).
// Usage: run start-corporation.js
/** @param {NS} ns */
export async function main(ns) {
  const running = (/** @type {string} */ script) => ns.ps("home").some((process) => process.filename === script);
  if (!ns.corporation.hasCorporation()) ns.tprint("No corporation yet: services/corp-status.js waits until one exists.");
  for (const service of CORPORATION_SERVICES) {
    if (running(service)) ns.tprint(`${service} already running`);
    else ns.tprint(`${service}: ${ns.exec(service, "home") ? "started" : "FAILED (not enough free RAM on home?)"}`);
  }
  if (running(AGENT)) return;
  ns.tprint("handing over to agent.js");
  ns.spawn(AGENT, { spawnDelay: 100 });
}
