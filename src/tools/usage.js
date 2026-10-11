import { scanAll } from "lib/net.js";

const REPORT_FILE = "data/usage.txt";
const WORKER_PREFIX = "workers/";

// usage.js [--all]: RAM and running scripts per rooted server, then worker threads per target.
// Workers are summed per script and target ("workers/grow.js 120t -> harakiri-sushi 80, n00dles 40").
// --all also lists idle and unrooted servers (unrooted RAM is not counted in the total). Also written to data/usage.txt.
/** @param {NS} ns */
export async function main(ns) {
  const flags = ns.flags([["all", false]]);
  const lines = [];
  /** @type {Map<string, Map<string, number>>} target -> worker script -> threads */
  const threadsByTarget = new Map();
  let usedTotal = 0, maxTotal = 0;

  const hosts = [...scanAll(ns).keys()]
    .filter((host) => ns.getServerMaxRam(host) > 0 && (flags.all || ns.hasRootAccess(host)))
    .sort((a, b) => ns.getServerUsedRam(b) - ns.getServerUsedRam(a));

  lines.push(`${"HOST".padEnd(20)}${"RAM USED".padStart(22)}   SCRIPTS`);
  for (const host of hosts) {
    const processes = ns.ps(host);
    const used = ns.getServerUsedRam(host), max = ns.getServerMaxRam(host);
    if (ns.hasRootAccess(host)) {
      usedTotal += used;
      maxTotal += max;
    }
    if (!processes.length && !flags.all) continue;

    /** @type {Map<string, {threads: number, targets: Map<string, number>}>} */
    const byScript = new Map();
    for (const process of processes) {
      const entry = byScript.get(process.filename) ?? { threads: 0, targets: new Map() };
      entry.threads += process.threads;
      if (process.filename.startsWith(WORKER_PREFIX) && process.args.length) {
        const target = String(process.args[0]);
        entry.targets.set(target, (entry.targets.get(target) ?? 0) + process.threads);
        const perTarget = threadsByTarget.get(target) ?? new Map();
        perTarget.set(process.filename, (perTarget.get(process.filename) ?? 0) + process.threads);
        threadsByTarget.set(target, perTarget);
      }
      byScript.set(process.filename, entry);
    }
    const scripts = [...byScript].map(([file, { threads, targets }]) => {
      const targetList = [...targets].map(([target, count]) => `${target} ${count}`).join(", ");
      return `${file} ${threads}t${targetList ? ` -> ${targetList}` : ""}`;
    });
    const ram = `${ns.format.ram(used)} / ${ns.format.ram(max)}`;
    const label = ns.hasRootAccess(host) ? host : `${host} (no root)`;
    lines.push(`${label.padEnd(20)}${ram.padStart(22)}   ${scripts.join(" | ") || "-"}`);
  }
  lines.push(`${"TOTAL".padEnd(20)}${`${ns.format.ram(usedTotal)} / ${ns.format.ram(maxTotal)}`.padStart(22)}`);

  lines.push("", `${"TARGET".padEnd(20)}${"HACK".padStart(8)}${"GROW".padStart(8)}${"WEAKEN".padStart(8)}`);
  const targetRows = [...threadsByTarget].sort((a, b) => sum(b[1]) - sum(a[1]));
  for (const [target, perScript] of targetRows) {
    const threads = (/** @type {string} */ worker) => String(perScript.get(WORKER_PREFIX + worker) ?? 0).padStart(8);
    lines.push(`${target.padEnd(20)}${threads("hack.js")}${threads("grow.js")}${threads("weaken.js")}`);
  }

  const report = lines.join("\n");
  ns.tprint("\n" + report);
  ns.write(REPORT_FILE, report, "w");
}

/** @param {Map<string, number>} counts */
function sum(counts) {
  return [...counts.values()].reduce((total, count) => total + count, 0);
}
