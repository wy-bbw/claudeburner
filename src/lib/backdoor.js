import { pathTo, scanAll } from "lib/net.js";

// Servers whose backdoor gets a faction invite, or lowers a company faction's invite threshold by 25%.
export const FACTION_SERVERS = ["CSEC", "avmnite-02h", "I.I.I.I", "run4theh111z", "w0r1d_d43m0n"];
export const COMPANY_SERVERS = ["b-and-a", "clarkinc", "ecorp", "megacorp", "kuai-gong", "4sigma", "nwo", "blade", "omnitek", "fulcrumassets", "fulcrumtech"];

/**
 * Every server that can get a backdoor now (rooted, hacking level high enough, not your own, none yet), faction
 * servers first, then company servers, then the rest (nearest first), each with its path from home.
 * w0r1d_d43m0n is left out: backdooring it ends the BitNode, so that stays a deliberate step.
 * @param {NS} ns @param {boolean} importantOnly only faction and company servers
 * @returns {{host: string, path: string[]}[]} path starts with "home"
 */
export function backdoorCandidates(ns, importantOnly) {
  const parents = scanAll(ns);
  const hacking = ns.getHackingLevel();
  const priority = (/** @type {string} */ host) => FACTION_SERVERS.includes(host) ? 0 : COMPANY_SERVERS.includes(host) ? 1 : 2;
  return [...parents.keys()].filter((host) => {
    if (host === "home" || host === "darkweb" || host === "w0r1d_d43m0n") return false;
    const server = ns.getServer(host);
    return !server.purchasedByPlayer && server.hasAdminRights && !server.backdoorInstalled
      && (server.requiredHackingSkill ?? Infinity) <= hacking && (!importantOnly || priority(host) < 2);
  }).map((host) => ({ host, path: pathTo(parents, host) }))
    .sort((a, b) => priority(a.host) - priority(b.host) || a.path.length - b.path.length);
}
