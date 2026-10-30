import { appendLog } from "lib/log.js";

// Shared by services/stock-trader.js (forecast estimated from price history) and
// services/stock-trader-4s.js (forecast read from the 4S Market Data TIX API).
// Long positions only: short selling needs BitNode 8 or Source-File 8.
// Run only one trader at a time: both trade the same positions.

export const STOCK_LOG = "data/stocks.txt";
const COMMISSION = 100_000;
/** Smallest purchase worth making: below this the $100k commission costs more than 1%. */
const MIN_PURCHASE = 100 * COMMISSION;
/** The ask price is a little above getPrice (the mid price); keep that much headroom when sizing a purchase. */
const ASK_MARGIN = 1.02;

/** @param {NS} ns @param {string} symbol */
export function ownedShares(ns, symbol) {
  return ns.stock.getPosition(symbol)[0];
}

/**
 * Sells every share of the stock and logs the profit after both commissions.
 * @param {NS} ns @param {string} symbol @param {string} reason
 * @returns {number} the profit (0 if nothing was sold)
 */
export function sellAllShares(ns, symbol, reason) {
  const [shares, averagePrice] = ns.stock.getPosition(symbol);
  if (shares <= 0) return 0;
  const salePrice = ns.stock.sellStock(symbol, shares);
  if (!salePrice) return 0;
  const profit = shares * (salePrice - averagePrice) - 2 * COMMISSION;
  appendLog(ns, STOCK_LOG, "sell", `${symbol}: ${ns.format.number(shares)} shares at $${ns.format.number(salePrice)}, `
    + `profit $${ns.format.number(profit)} (${reason})`);
  return profit;
}

/**
 * Buys the candidates in order, best first, each up to the market's share limit, while the budget lasts.
 * @param {NS} ns @param {{symbol: string, reason: string}[]} candidates @param {number} budget
 */
export function buyInOrder(ns, candidates, budget) {
  for (const { symbol, reason } of candidates) {
    if (budget < MIN_PURCHASE) return;
    const price = ns.stock.getPrice(symbol) * ASK_MARGIN;
    const room = ns.stock.getMaxShares(symbol) - ownedShares(ns, symbol);
    const shares = Math.min(room, Math.floor((budget - COMMISSION) / price));
    if (shares * price < MIN_PURCHASE) continue;
    const paidPerShare = ns.stock.buyStock(symbol, shares);
    if (!paidPerShare) continue;
    budget -= shares * paidPerShare + COMMISSION;
    appendLog(ns, STOCK_LOG, "buy", `${symbol}: ${ns.format.number(shares)} shares at $${ns.format.number(paidPerShare)} (${reason})`);
  }
}

/** What the open positions cost (shares x average price, without commissions). @param {NS} ns @param {string[]} symbols */
export function investedAtCost(ns, symbols) {
  let cost = 0;
  for (const symbol of symbols) {
    const [shares, averagePrice] = ns.stock.getPosition(symbol);
    cost += shares * averagePrice;
  }
  return cost;
}

/**
 * One summary line: positions, their value at the current price, the profit not yet sold (value - cost), the profit
 * sold since the trader started, and both together.
 * @param {NS} ns @param {string[]} symbols @param {number} realisedProfit
 */
export function logSummary(ns, symbols, realisedProfit) {
  let positions = 0, value = 0;
  for (const symbol of symbols) {
    const shares = ownedShares(ns, symbol);
    if (shares <= 0) continue;
    positions++;
    value += shares * ns.stock.getPrice(symbol);
  }
  const unrealisedProfit = value - investedAtCost(ns, symbols);
  appendLog(ns, STOCK_LOG, "summary", `${positions} positions worth $${ns.format.number(value)}, `
    + `unrealised $${ns.format.number(unrealisedProfit)}, realised $${ns.format.number(realisedProfit)}, `
    + `total $${ns.format.number(unrealisedProfit + realisedProfit)} since start`);
}
