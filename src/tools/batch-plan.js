import { scanAll } from "lib/net.js";
import { planBatches, targetOptions } from "lib/batch-planner.js";

const REPORT_FILE = "data/batch-plan.txt";

// batch-plan.js [--threads N] [--spacing ms] [--batches-per-target N]: the batcher's RAM split for the
// current player, as if every hackable target were prepped. Default budget: all rooted RAM / 1.8 GB.
// Written to data/batch-plan.txt. Needs Formulas.exe.
/** @param {NS} ns */
export async function main(ns) {
  const flags = ns.flags([["threads", 0], ["spacing", 30], ["batches-per-target", 400]]);
  const hosts = [...scanAll(ns).keys()].filter((host) => ns.hasRootAccess(host));
  const budget = Number(flags.threads) || hosts.reduce((sum, host) => sum + Math.floor(ns.getServerMaxRam(host) / 1.8), 0);
  const player = ns.getPlayer();
  const settings = { spacingMs: Number(flags.spacing), leadMs: 1000, growMargin: 1.05, maxBatchesPerTarget: Number(flags["batches-per-target"]) };
  const optionsList = hosts
    .filter((host) => host !== "home" && ns.getServerMaxMoney(host) > 0 && ns.getServerRequiredHackingLevel(host) <= player.skills.hacking)
    .map((host) => targetOptions(ns, host, player, settings))
    .filter((options) => options !== null);
  const plans = planBatches(optionsList, budget);

  const lines = [`budget ${budget} threads, hacking ${player.skills.hacking}`,
    `${"TARGET".padEnd(20)}${"FRACTION".padStart(9)}${"H/G/W1/W2".padStart(22)}${"BATCH/S".padStart(9)}${"IN FLIGHT".padStart(10)}${"WEAKEN S".padStart(9)}${"THREADS".padStart(9)}${"$/S".padStart(10)}`];
  let totalMoney = 0, totalThreads = 0, totalInFlight = 0;
  for (const plan of [...plans.values()].sort((a, b) => b.moneyPerSecond - a.moneyPerSecond)) {
    const shape = plan.shape;
    const inFlight = plan.batchesPerSecond * (shape.weakenMs + 1000) / 1000;
    totalMoney += plan.moneyPerSecond; totalThreads += plan.threads; totalInFlight += inFlight;
    lines.push(plan.target.padEnd(20) + shape.hackFraction.toFixed(3).padStart(9)
      + `${shape.hackThreads}/${shape.growThreads}/${shape.weaken1Threads}/${shape.weaken2Threads}`.padStart(22)
      + plan.batchesPerSecond.toFixed(2).padStart(9) + inFlight.toFixed(0).padStart(10) + (shape.weakenMs / 1000).toFixed(0).padStart(9)
      + Math.round(plan.threads).toString().padStart(9) + ns.format.number(plan.moneyPerSecond).padStart(10));
  }
  lines.push(`total ${plans.size} targets, ${Math.round(totalThreads)} threads, ~${Math.round(totalInFlight)} batches in flight, $${ns.format.number(totalMoney)}/s`);
  const report = lines.join("\n");
  ns.tprint("\n" + report);
  ns.write(REPORT_FILE, report, "w");
}
