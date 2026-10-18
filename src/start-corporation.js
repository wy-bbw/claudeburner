const AGENT = "agent.js";
// Corporation services on home, started in this order. Their worker scripts (11.6 GB readers, 21.6 GB actions) take
// turns on the remaining RAM (lib/corp-scripts.js). corp-status.js feeds the dashboard; corp-manager.js (~115 GB, reads the API
// itself) prices from the start, its product work waits until a product division exists.
const CORPORATION_SERVICES = ["services/corp-status.js", "services/corp-manager.js"];
// Arguments per service (corp-manager: reinvest a share of the funds every 30 minutes).
const SERVICE_ARGS = { "services/corp-manager.js": ["--reinvest-minutes", 30] };

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
    else ns.tprint(`${service}: ${ns.exec(service, "home", 1, ...(SERVICE_ARGS[/** @type {keyof typeof SERVICE_ARGS} */ (service)] ?? [])) ? "started" : "FAILED (not enough free RAM on home?)"}`);
  }
  if (running(AGENT)) return;
  ns.tprint("handing over to agent.js");
  ns.spawn(AGENT, { spawnDelay: 100 });
}
