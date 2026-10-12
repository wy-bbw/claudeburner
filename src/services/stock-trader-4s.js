import { STOCK_LOG, buyInOrder, logSummary, ownedShares, sellAllShares } from "lib/stock-trading.js";
import { appendLog } from "lib/log.js";

const SUMMARY_EVERY_TICKS = 10; // one tick is 6 s: a summary per minute

// stock-trader-4s.js: trades with the forecast from the 4S Market Data TIX API ($25b + $1b 4S data).
// Without it, use services/stock-trader.js (estimates the forecast from price history). Never both.
// Each market tick: sell what fell below --sell-below, then buy the stocks above --buy-above,
// best expected gain per tick first: (forecast - 0.5) * volatility.
// Log: data/stocks.txt. RAM ~19.6 GB (stock functions cost 2-2.5 GB each).
// Flags: --buy-above <forecast, default 0.6> --sell-below <forecast, default 0.55> --keep <cash fraction to keep, default 0>
/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  if (!ns.stock.has4SDataTixApi()) {
    ns.tprint("stock-trader-4s.js needs the 4S Market Data TIX API; run services/stock-trader.js instead");
    return;
  }
  const options = ns.flags([["buy-above", 0.6], ["sell-below", 0.55], ["keep", 0]]);
  const buyAbove = Number(options["buy-above"]), sellBelow = Number(options["sell-below"]), keepFraction = Number(options.keep);
  const symbols = ns.stock.getSymbols();
  appendLog(ns, STOCK_LOG, "start", `4S trader: buy above ${buyAbove}, sell below ${sellBelow}, keep ${keepFraction * 100}% cash`);

  let realisedProfit = 0;
  for (let tick = 1; ; tick++) {
    await ns.stock.nextUpdate();
    const forecasts = new Map(symbols.map((symbol) => [symbol, ns.stock.getForecast(symbol)]));

    for (const symbol of symbols) {
      const forecast = /** @type {number} */ (forecasts.get(symbol));
      if (forecast < sellBelow && ownedShares(ns, symbol) > 0) realisedProfit += sellAllShares(ns, symbol, `forecast ${forecast.toFixed(2)}`);
    }

    const candidates = symbols
      .map((symbol) => ({ symbol, forecast: /** @type {number} */ (forecasts.get(symbol)), volatility: ns.stock.getVolatility(symbol) }))
      .filter((stock) => stock.forecast >= buyAbove)
      .sort((a, b) => (b.forecast - 0.5) * b.volatility - (a.forecast - 0.5) * a.volatility)
      .map((stock) => ({ symbol: stock.symbol, reason: `forecast ${stock.forecast.toFixed(2)}, volatility ${(stock.volatility * 100).toFixed(1)}%` }));
    buyInOrder(ns, candidates, ns.getServerMoneyAvailable("home") * (1 - keepFraction));

    if (tick % SUMMARY_EVERY_TICKS === 0) logSummary(ns, symbols, realisedProfit);
  }
}
