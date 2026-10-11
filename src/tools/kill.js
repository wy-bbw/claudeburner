// kill.js <host> [script]: kill one script, or everything, on a host.
// Only processes started before this one (lower PID): a restart queues kill + start back to back,
// and the new instance must survive the kill.
/** @param {NS} ns */
export async function main(ns) {
  const [host, script] = ns.args.map(String);
  const victims = ns.ps(host).filter((process) => process.pid < ns.pid && (!script || process.filename === script));
  for (const process of victims) ns.kill(process.pid);
  ns.tprint(`kill ${host} ${script ?? "*"}: ${victims.length} process(es)`);
}
