/** @param {NS} ns */
export function countOpeners(ns) {
  return ["BruteSSH.exe", "FTPCrack.exe", "relaySMTP.exe", "HTTPWorm.exe", "SQLInject.exe"]
    .filter((f) => ns.fileExists(f, "home")).length;
}

// Port openers are called explicitly: the RAM calculator can't see ns[fn].
/** @param {NS} ns @param {string} h @param {number} openers */
export function tryRoot(ns, h, openers) {
  if (ns.hasRootAccess(h) || ns.getServerNumPortsRequired(h) > openers) return false;
  if (ns.fileExists("BruteSSH.exe", "home")) ns.brutessh(h);
  if (ns.fileExists("FTPCrack.exe", "home")) ns.ftpcrack(h);
  if (ns.fileExists("relaySMTP.exe", "home")) ns.relaysmtp(h);
  if (ns.fileExists("HTTPWorm.exe", "home")) ns.httpworm(h);
  if (ns.fileExists("SQLInject.exe", "home")) ns.sqlinject(h);
  ns.nuke(h);
  ns.print(`rooted ${h}`);
  return true;
}

// Classic heuristic: most max-money per unit of min-security, among servers
// whose required level is at most half ours (high hack chance, fast ops).
/** @param {NS} ns @param {string[]} rooted */
export function pickTarget(ns, rooted) {
  const lvl = ns.getHackingLevel();
  let best = "", bestScore = 0;
  for (const h of rooted) {
    const req = ns.getServerRequiredHackingLevel(h);
    if (req > Math.max(1, lvl / 2)) continue;
    const score = ns.getServerMaxMoney(h) / ns.getServerMinSecurityLevel(h);
    if (score > bestScore) { best = h; bestScore = score; }
  }
  return best;
}
