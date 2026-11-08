import { sellAllShares } from "lib/stock-trading.js";
import { setCashReserve } from "lib/cash-reserve.js";

const TRADERS = ["services/stock-trader.js", "services/stock-trader-4s.js"];
const TRADER_RESERVE_OWNER = "stock-trader";

// sell-all-stocks.js: turns every stock position into cash, e.g. before founding the corporation (it needs the money
// as cash). Stops the traders first so they do not buy again, clears the trader's cash reservation, then sells every
// position. Each sale goes to data/stocks.txt; the total is printed.
// Usage: run tools/sell-all-stocks.js
/** @param {NS} ns */
export async function main(ns) {
  for (const trader of TRADERS) {
    if (ns.scriptKill(trader, "home")) ns.tprint(`stopped ${trader}`);
  }
  setCashReserve(ns, TRADER_RESERVE_OWNER, 0);
  const moneyBefore = ns.getServerMoneyAvailable("home");
  let positions = 0, profit = 0;
  for (const symbol of ns.stock.getSymbols()) {
    if (ns.stock.getPosition(symbol)[0] <= 0) continue;
    positions++;
    profit += sellAllShares(ns, symbol, "sell-all-stocks");
  }
  const proceeds = ns.getServerMoneyAvailable("home") - moneyBefore;
  ns.tprint(`sold ${positions} positions for $${ns.format.number(proceeds)} (profit $${ns.format.number(profit)}); `
    + `cash now $${ns.format.number(ns.getServerMoneyAvailable("home"))}`);
}
