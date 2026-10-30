import { appendLog } from "lib/log.js";

const LOG_FILE = "data/stock-watch.txt";
const WINDOW = 50; // ticks, like services/stock-trader.js
const LOG_EVERY_TICKS = 10; // one tick is 6 s: a line per minute

// stock-watch.js: watches a few stocks without trading them: every minute the share of the last 50 price ticks that
// went up (the trader's forecast estimate; 0.5 = no trend) and the price. Made to see whether growing the company's
// server with {stock: true} (services/hacking/batcher.js --stock-grow) moves the stock.
// Log (readable lines): data/stock-watch.txt.
// Usage: run services/stock-watch.js --symbols JGN,FNS,SGC
/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  const options = ns.flags([["symbols", "JGN,FNS,SGC"]]);
  const symbols = String(options.symbols).split(",").filter(Boolean);
  /** @type {Map<string, number[]>} 1 per tick up, 0 per tick down, newest last */
  const moves = new Map(symbols.map((symbol) => [symbol, []]));
  const lastPrices = new Map(symbols.map((symbol) => [symbol, ns.stock.getPrice(symbol)]));
  appendLog(ns, LOG_FILE, "start", `watching ${symbols.join(", ")}`);
  for (let tick = 1; ; tick++) {
    await ns.stock.nextUpdate();
    for (const symbol of symbols) {
      const price = ns.stock.getPrice(symbol), lastPrice = /** @type {number} */ (lastPrices.get(symbol));
      lastPrices.set(symbol, price);
      if (price === lastPrice) continue;
      const recent = /** @type {number[]} */ (moves.get(symbol));
      recent.push(price > lastPrice ? 1 : 0);
      if (recent.length > WINDOW) recent.shift();
    }
    if (tick % LOG_EVERY_TICKS !== 0) continue;
    const parts = symbols.map((symbol) => {
      const recent = /** @type {number[]} */ (moves.get(symbol));
      const upShare = recent.length ? recent.reduce((sum, up) => sum + up, 0) / recent.length : 0;
      return `${symbol} up ${upShare.toFixed(2)} over ${recent.length} ticks, $${ns.format.number(ns.stock.getPrice(symbol))}`;
    });
    appendLog(ns, LOG_FILE, "watch", parts.join(" | "));
  }
}
