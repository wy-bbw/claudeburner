// kill.js <host> [script]  - kill one script, or everything, on a host.
/** @param {NS} ns */
export async function main(ns) {
  const [host, script] = ns.args.map(String);
  const ok = script ? ns.scriptKill(script, host) : ns.killall(host, true);
  ns.tprint(`kill ${host} ${script ?? "*"}: ${ok}`);
}
