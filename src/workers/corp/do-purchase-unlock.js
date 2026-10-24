import { performCalls } from "lib/corp-calls.js";

// workers/corp/do-purchase-unlock.js <JSON list of [unlockName]>: buys a one-time corporation unlock (Smart Supply, Warehouse API...).
// One corporation action per script (20 GB); started via lib/corp-scripts.js runAction. Results -> data/corp/do-purchase-unlock.txt
/** @param {NS} ns */
export async function main(ns) {
  performCalls(ns, "purchase-unlock", ([unlock]) => ns.corporation.purchaseUnlock(unlock));
}
