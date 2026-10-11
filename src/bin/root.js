import { scanAll } from "lib/net.js";

// Opens ports and nukes every server we can. Port openers are called
// explicitly because the RAM calculator can't see dynamic ns[fn] calls.
/** @param {NS} ns */
export async function main(ns) {
  const has = (/** @type {string} */ f) => ns.fileExists(f, "home");
  const openers = ["BruteSSH.exe", "FTPCrack.exe", "relaySMTP.exe", "HTTPWorm.exe", "SQLInject.exe"].filter(has).length;
  const rooted = [];
  for (const host of scanAll(ns).keys()) {
    if (host === "home" || ns.hasRootAccess(host)) continue;
    if (ns.getServerNumPortsRequired(host) > openers) continue;
    if (has("BruteSSH.exe")) ns.brutessh(host);
    if (has("FTPCrack.exe")) ns.ftpcrack(host);
    if (has("relaySMTP.exe")) ns.relaysmtp(host);
    if (has("HTTPWorm.exe")) ns.httpworm(host);
    if (has("SQLInject.exe")) ns.sqlinject(host);
    ns.nuke(host);
    rooted.push(host);
  }
  ns.tprint(`root: ${rooted.length} new (${rooted.join(", ") || "none"}), openers=${openers}`);
}
