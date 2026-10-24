// One-shot weaken. args: target, nonce, delay ms
/** @param {NS} ns */
export async function main(ns) {
  await ns.weaken(String(ns.args[0]), { additionalMsec: Number(ns.args[2] ?? 0) });
}
