// kill-duplicates.js <host> <script>: keeps the newest process of a script on a host (highest PID) and kills the others.
// Safe to run twice at once (e.g. by two agents): both keep the same process.
// Usage: run tools/kill-duplicates.js home agent.js
/** @param {NS} ns */
export async function main(ns) {
  const [host, script] = ns.args.map(String);
  if (!host || !script) { ns.tprint("usage: run tools/kill-duplicates.js <host> <script>"); return; }
  const processes = ns.ps(host).filter((process) => process.filename === script).sort((a, b) => b.pid - a.pid);
  for (const process of processes.slice(1)) ns.kill(process.pid);
  ns.tprint(`${script} on ${host}: ${processes.length} running, kept PID ${processes[0]?.pid ?? "none"}, killed ${Math.max(0, processes.length - 1)}`);
}
