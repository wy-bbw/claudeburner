// Corporation growth toward investor funding. Blank slate (2026-10-18): separate from services/corp/manager.js, which
// stays the manager for a mature company. Nothing is bought or changed here yet; it reads the corporation API in its own
// process (no state file) and prints what the investors see, so the strategy can be worked out step by step.
// RAM: each distinct corporation call costs 10 GB.
// Usage: run services/corp/growth.js

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  if (!ns.corporation.hasCorporation()) { ns.tprint("no corporation yet"); return; }
  const corporation = ns.corporation.getCorporation();
  const offer = ns.corporation.getInvestmentOffer();
  const profit = corporation.revenue - corporation.expenses;
  ns.tprint(`funds $${ns.format.number(corporation.funds)}, profit $${ns.format.number(profit)}/s, valuation $${ns.format.number(corporation.valuation)}`);
  ns.tprint(`offer round ${offer.round}: $${ns.format.number(offer.funds)} for ${ns.format.number(offer.shares)} shares`);
}
