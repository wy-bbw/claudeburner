export const TARGET_PORT = 1;

// Simple early-game worker. Reads the current target from a port so the
// daemon can retarget every worker without killing anything.
/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  while (true) {
    const data = ns.peek(TARGET_PORT);
    if (data === "NULL PORT DATA") {
      await ns.sleep(1000);
      continue;
    }
    const t = String(data);
    if (ns.getServerSecurityLevel(t) > ns.getServerMinSecurityLevel(t) + 5) await ns.weaken(t);
    else if (ns.getServerMoneyAvailable(t) < ns.getServerMaxMoney(t) * 0.75) await ns.grow(t);
    else await ns.hack(t);
  }
}
