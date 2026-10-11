// One-shot hack. args: target, nonce (lets identical jobs share a host)
/** @param {NS} ns */
export async function main(ns) {
  await ns.hack(String(ns.args[0]));
}
