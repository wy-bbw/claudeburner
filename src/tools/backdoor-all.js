import { appendLog } from "lib/log.js";
import { backdoorCandidates } from "lib/backdoor.js";

const LOG_FILE = "data/backdoors.txt";

// backdoor-all.js (needs the Singularity API: BitNode 4, or Source-File 4 at 16x/4x RAM): walks to every server that
// can get a backdoor now (lib/backdoor.js; faction and company servers first) and installs it, then returns home.
// w0r1d_d43m0n is never included (that ends the BitNode). Takes a while: each backdoor runs like a hack.
// Log: data/backdoors.txt.
// Usage: run tools/backdoor-all.js [--important]
/** @param {NS} ns */
export async function main(ns) {
  const options = ns.flags([["important", false]]);
  const candidates = backdoorCandidates(ns, Boolean(options.important));
  if (!candidates.length) { ns.tprint("Nothing to backdoor right now."); return; }
  ns.tprint(`backdooring ${candidates.length} servers: ${candidates.map(({ host }) => host).join(", ")}`);
  let done = 0;
  for (const { host, path } of candidates) {
    ns.singularity.connect("home");
    if (!path.slice(1).every((hop) => ns.singularity.connect(hop))) {
      appendLog(ns, LOG_FILE, "failed", `could not connect to ${host} via ${path.join(" > ")}`);
      continue;
    }
    await ns.singularity.installBackdoor();
    appendLog(ns, LOG_FILE, "backdoor", host);
    done++;
  }
  ns.singularity.connect("home");
  ns.tprint(`done: ${done}/${candidates.length} backdoors (log ${LOG_FILE})`);
}
