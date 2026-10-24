// Batch weaken. args: target, landAt (epoch ms when it must finish), batch id
// Computes its own delay from the real duration at start (see batch-hack.js).
/** @param {NS} ns */
export async function main(ns) {
  const target = String(ns.args[0]);
  const delay = Number(ns.args[1]) - Date.now() - ns.getWeakenTime(target);
  await ns.weaken(target, { additionalMsec: Math.max(0, Math.floor(delay)) });
}
