import { TARGET_PORT } from "lib/ports.js";

const OUT = "data/metrics.txt";

// Appends one sample every 10 s to data/metrics.txt (on home): cumulative
// hacking money and XP, so rates come from deltas and ignore spending,
// plus the target's money/security to show oscillation.
// Sized to fit a 4 GB server (3.95 GB).
/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  const self = ns.getHostname();
  while (true) {
    const p = ns.getPlayer();
    const target = String(ns.peek(TARGET_PORT));
    const sample = {
      t: Date.now(),
      lvl: p.skills.hacking,
      xp: p.exp.hacking,
      hackMoney: ns.getMoneySources().sinceInstall.hacking,
      money: p.money,
      target,
      tMoney: target === "NULL PORT DATA" ? 0 : ns.getServerMoneyAvailable(target),
      tSec: target === "NULL PORT DATA" ? 0 : ns.getServerSecurityLevel(target),
    };
    ns.write(OUT, JSON.stringify(sample) + "\n", "a");
    if (self !== "home") ns.scp(OUT, "home", self);
    await ns.sleep(10000);
  }
}
