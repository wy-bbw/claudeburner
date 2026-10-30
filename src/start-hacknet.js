const HACKNET_MANAGER = "services/hacknet/manager.js";
const AGENT = "agent.js";

// start-hacknet.js: starts the hacknet manager on home (any BitNode: hacknet servers or nodes), in addition to
// start.js or start-corporation.js, and hands over to agent.js if it is not running yet.
// A running manager keeps its arguments: kill services/hacknet/manager.js first to change them.
// Usage: run start-hacknet.js [--payback-hours 24] [--reserve 0] [--spend auto|money|corporation-funds|corporation-research]
/** @param {NS} ns */
export async function main(ns) {
  const running = (/** @type {string} */ script) => ns.ps("home").some((process) => process.filename === script);
  if (running(HACKNET_MANAGER)) ns.tprint(`${HACKNET_MANAGER} already running`);
  else ns.tprint(`${HACKNET_MANAGER}: ${ns.exec(HACKNET_MANAGER, "home", 1, ...ns.args) ? "started" : "FAILED (not enough free RAM on home?)"}`);
  if (running(AGENT)) return;
  ns.tprint("handing over to agent.js");
  ns.spawn(AGENT, { spawnDelay: 100 });
}
