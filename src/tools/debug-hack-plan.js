import { planHack, jobThreads } from "services/controller.js";

// debug-hack-plan.js <target> [availableThreads]: writes the controller's hack plan for a target
// plus its inputs to data/debug-hack-plan.txt.
/** @param {NS} ns */
export async function main(ns) {
  const target = String(ns.args[0] ?? "n00dles");
  const available = Number(ns.args[1] ?? 719);
  const job = planHack(ns, target, available);
  const report = {
    target,
    available,
    money: ns.getServerMoneyAvailable(target),
    maxMoney: ns.getServerMaxMoney(target),
    security: ns.getServerSecurityLevel(target),
    minSecurity: ns.getServerMinSecurityLevel(target),
    stolenPerThread: ns.hackAnalyze(target),
    job,
    jobThreads: jobThreads(job),
  };
  ns.write("data/debug-hack-plan.txt", JSON.stringify(report, null, 1), "w");
}
