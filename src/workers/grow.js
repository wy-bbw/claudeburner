// One-shot grow. args: target, nonce, delay ms
/** @param {NS} ns */
export async function main(ns) {
  await ns.grow(String(ns.args[0]), { additionalMsec: Number(ns.args[2] ?? 0) });
}
