// Batch hack. args: target, landAt (epoch ms when it must finish), batch id
// Computes its own delay from the real duration at start, so exec latency and security that is
// briefly raised by another batch's landing don't shift its landing time.
/** @param {NS} ns */
export async function main(ns) {
  const target = String(ns.args[0]);
  const delay = Number(ns.args[1]) - Date.now() - ns.getHackTime(target);
  if (delay < 0) return; // would land late and out of order; skipping a hack is always safe
  await ns.hack(target, { additionalMsec: Math.floor(delay) });
}
