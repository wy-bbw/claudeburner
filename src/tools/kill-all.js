import { scanAll } from "lib/net.js";

// kill-all.js: kills every script on every server reachable from home (home, cloud servers, the network),
// except this one. Darknet servers beyond darkweb aren't reachable by scan, so their phishers keep running.
// Afterwards nothing runs, including agent.js: `run start.js` brings everything back.
// Flags: --keep-agent (spare agent.js on home, so the bridge can still run commands)
/** @param {NS} ns */
export async function main(ns) {
  const options = ns.flags([["keep-agent", false]]);
  let stopped = 0;
  const perHost = [];
  for (const host of scanAll(ns).keys()) {
    const victims = ns.ps(host).filter((process) => process.pid !== ns.pid
      && !(options["keep-agent"] && host === "home" && process.filename === "agent.js"));
    for (const process of victims) if (ns.kill(process.pid)) stopped++;
    if (victims.length) perHost.push(`${host} ${victims.length}`);
  }
  ns.tprint(`killed ${stopped} script(s): ${perHost.join(", ") || "nothing was running"}`);
  ns.tprint(options["keep-agent"] ? "agent.js kept running." : "Everything is stopped. `run start.js` restarts it.");
}
