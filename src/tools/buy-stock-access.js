import { setCashReserve } from "lib/cash-reserve.js";

const RESERVE_OWNER = "buy-stock-access";
const CHECK_INTERVAL_MS = 5_000;

// buy-stock-access.js: buys the WSE account and the TIX API (what services/stock-trader.js needs) as soon as the
// money is there. While it waits it reserves their price (lib/cash-reserve.js), so the hacknet manager does not
// spend it. Ends when both are owned.
// Usage: run tools/buy-stock-access.js
/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  ns.atExit(() => setCashReserve(ns, RESERVE_OWNER, 0));
  const constants = ns.stock.getConstants();
  while (true) {
    const hasWse = ns.stock.hasWseAccount(), hasTix = ns.stock.hasTixApiAccess();
    if (hasWse && hasTix) {
      ns.tprint("WSE account and TIX API owned");
      return;
    }
    const cost = (hasWse ? 0 : constants.WseAccountCost) + (hasTix ? 0 : constants.TixApiCost);
    setCashReserve(ns, RESERVE_OWNER, cost);
    if (ns.getServerMoneyAvailable("home") >= cost) {
      if (!hasWse && ns.stock.purchaseWseAccount()) ns.tprint(`bought the WSE account for $${ns.format.number(constants.WseAccountCost)}`);
      if (!hasTix && ns.stock.purchaseTixApi()) ns.tprint(`bought the TIX API for $${ns.format.number(constants.TixApiCost)}`);
    }
    await ns.sleep(CHECK_INTERVAL_MS);
  }
}
