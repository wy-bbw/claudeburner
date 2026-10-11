import { scanAll, pathTo } from "lib/net.js";

// path.js <host>: prints a paste-ready connect chain + backdoor.
// Without args: lists the faction servers that want a backdoor.
const FACTION_SERVERS = ["CSEC", "avmnite-02h", "I.I.I.I", "run4theh111z", "w0r1d_d43m0n"];

/** @param {NS} ns */
export async function main(ns) {
  const parents = scanAll(ns);
  const hosts = ns.args.length ? ns.args.map(String) : FACTION_SERVERS.filter((h) => parents.has(h));
  for (const host of hosts) {
    if (!parents.has(host)) {
      ns.tprint(`${host}: not found`);
      continue;
    }
    const chain = pathTo(parents, host).slice(1).map((h) => `connect ${h}`).join("; ");
    ns.tprint(`${host}: home; ${chain}; backdoor`);
  }
}
