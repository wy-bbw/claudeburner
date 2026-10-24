// Shares this thread's RAM with factions forever (boosts faction-work rep/s).
/** @param {NS} ns */
export async function main(ns) {
  while (true) await ns.share();
}
