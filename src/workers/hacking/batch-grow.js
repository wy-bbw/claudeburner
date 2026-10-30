// Batch grow. args: target, landAt (epoch ms when it must finish), batch id, optional "stock": grow with
// {stock: true}, which can raise the forecast of the target company's stock (services/hacking/batcher.js --stock-grow).
// Computes its own delay from the real duration at start (see batch-hack.js).
/** @param {NS} ns */
export async function main(ns) {
  const target = String(ns.args[0]);
  const delay = Number(ns.args[1]) - Date.now() - ns.getGrowTime(target);
  await ns.grow(target, { additionalMsec: Math.max(0, Math.floor(delay)), stock: ns.args[3] === "stock" });
}
