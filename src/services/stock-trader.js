import { STOCK_LOG, buyInOrder, logSummary, ownedShares, sellAllShares } from "lib/stock-trading.js";
import { appendLog } from "lib/log.js";

// Ticks for the forecast estimate (50 ticks = 5 min warm-up). The estimate's noise is ±0.07 at 50 ticks;
// at 20 it was ±0.11, so the trader bought stocks that only looked good by chance and sold them a minute later.
const LONG_WINDOW = 50;
// Quick check that sells early when a forecast flips: at most 2 of the last 10 ticks up.
// That fires for a good stock (forecast 0.65) in 0.5% of ticks, for a flipped one (0.35) in 26%.
// (The first version used 2 of 6: 12% false alarms, and the churn lost the bid/ask spread every time.)
const SHORT_WINDOW = 10;
const QUICK_SELL_MAX_UPS = 2;
const SUMMARY_EVERY_TICKS = 10; // one tick is 6 s: a summary per minute

// stock-trader.js: trades without the 4S API by estimating each forecast from price history:
// the share of the last LONG_WINDOW ticks that went up (35 of 50 up ≈ forecast 0.7).
// A long window is accurate but late when a forecast flips, so a SHORT_WINDOW check sells early.
// Buys need LONG_WINDOW ticks of history first (5 min after start).
// Once the 4S Market Data TIX API is owned, services/stock-trader-4s.js trades better: stop this one, start that.
// Log: data/stocks.txt. RAM ~14.6 GB (stock functions cost 2-2.5 GB each).
// Flags: --buy-above <estimated forecast, default 0.65> --sell-below <default 0.5> --keep <cash fraction to keep, default 0>
// With 50 ticks a neutral stock (0.5) reaches 0.65 by chance in 1.6% of ticks, a good one (0.65) falls below 0.5 in 1%.
/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  const options = ns.flags([["buy-above", 0.65], ["sell-below", 0.5], ["keep", 0]]);
  const buyAbove = Number(options["buy-above"]), sellBelow = Number(options["sell-below"]), keepFraction = Number(options.keep);
  const symbols = ns.stock.getSymbols();
  appendLog(ns, STOCK_LOG, "start", `history trader: buy above ${buyAbove}, sell below ${sellBelow}, keep ${keepFraction * 100}% cash`);

  /** Per symbol: 1 for every tick that went up, 0 for down, newest last. @type {Map<string, number[]>} */
  const moves = new Map(symbols.map((symbol) => [symbol, []]));
  const lastPrices = new Map(symbols.map((symbol) => [symbol, ns.stock.getPrice(symbol)]));
  /** @param {number[]} recent */
  const upShare = (recent) => recent.reduce((sum, up) => sum + up, 0) / recent.length;

  let realisedProfit = 0, told4S = false;
  for (let tick = 1; ; tick++) {
    await ns.stock.nextUpdate();
    for (const symbol of symbols) {
      const price = ns.stock.getPrice(symbol), lastPrice = /** @type {number} */ (lastPrices.get(symbol));
      lastPrices.set(symbol, price);
      if (price === lastPrice) continue;
      const recent = /** @type {number[]} */ (moves.get(symbol));
      recent.push(price > lastPrice ? 1 : 0);
      if (recent.length > LONG_WINDOW) recent.shift();
    }

    const estimates = symbols.map((symbol) => {
      const recent = /** @type {number[]} */ (moves.get(symbol));
      return { symbol, ticks: recent.length, longEstimate: upShare(recent), shortEstimate: upShare(recent.slice(-SHORT_WINDOW)) };
    });

    for (const stock of estimates) {
      if (stock.ticks < SHORT_WINDOW || ownedShares(ns, stock.symbol) <= 0) continue;
      if (stock.longEstimate < sellBelow || stock.shortEstimate * SHORT_WINDOW <= QUICK_SELL_MAX_UPS) {
        realisedProfit += sellAllShares(ns, stock.symbol, `estimate ${stock.longEstimate.toFixed(2)}, last ${SHORT_WINDOW} ticks ${stock.shortEstimate.toFixed(2)}`);
      }
    }

    const candidates = estimates
      .filter((stock) => stock.ticks >= LONG_WINDOW && stock.longEstimate >= buyAbove && stock.shortEstimate >= 0.5)
      .sort((a, b) => b.longEstimate - a.longEstimate)
      .map((stock) => ({ symbol: stock.symbol, reason: `estimate ${stock.longEstimate.toFixed(2)} over ${stock.ticks} ticks` }));
    buyInOrder(ns, candidates, ns.getServerMoneyAvailable("home") * (1 - keepFraction));

    if (tick % SUMMARY_EVERY_TICKS === 0) logSummary(ns, symbols, realisedProfit);
    if (!told4S && ns.stock.has4SDataTixApi()) {
      told4S = true;
      appendLog(ns, STOCK_LOG, "hint", "4S Market Data TIX API owned: stop this trader and run services/stock-trader-4s.js");
    }
  }
}
