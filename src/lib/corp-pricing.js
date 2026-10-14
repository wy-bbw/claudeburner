// Sell prices like Market-TA.II, without the 70k RP research (formulas: the game's corporation guide and code).
// Above MP + MarkupLimit the game sells Potential * (MarkupLimit / (price - MP))^2 per second. MarkupLimit needs the
// hidden product markup, but Potential * MarkupLimit^2 = C can be measured from one cycle that did not sell out:
// C = sold * (price - MP)^2. The highest price that still sells `supply` per second is then MP + sqrt(C / supply).
// While everything sells, C is unknown (only a lower bound): raise the price step by step until a little stock is left.
// Prices are set as "MP+<delta>", so the game follows market price changes by itself.

// Start low: a material's markup limit (quality / markup) is often only a few % of MP, and one unsold cycle can fill a warehouse.
const FIRST_DELTA_OF_MARKET_PRICE = 0.01;
const PROBE_FACTOR_UNCALIBRATED = 1.5;
const PROBE_FACTOR_CALIBRATED = 1.05;
const SOLD_OUT_TOLERANCE = 0.01;

/** "MP" -> 0, "MP+12.5" -> 12.5; anything else (a price set by hand) -> null: leave it alone. @param {unknown} price */
export function parsePriceDelta(price) {
  const text = String(price).replace(/\s+/g, "");
  if (text === "MP") return 0;
  const match = text.match(/^MP\+(\d+(?:\.\d+)?(?:e[+-]?\d+)?)$/i);
  return match ? Number(match[1]) : null;
}

/** @param {number} delta */
export function formatPrice(delta) {
  return delta > 0 ? `MP+${Number(delta.toPrecision(6))}` : "MP";
}

/**
 * The next price above MP for one item in one city.
 * @param {{marketPrice: number, delta: number, sold: number, supply: number, leftover: number}} item
 *   sold and supply per second over the last cycle (supply = what will come in for sale), leftover = units stored
 *   right after the last sale
 * @param {{calibrated?: boolean}} memory per item, kept between calls
 * @returns {{delta: number, reason: string}}
 */
export function nextPriceDelta(item, memory) {
  const { marketPrice, delta, sold, supply, leftover } = item;
  const offered = sold + leftover / 10;
  if (offered <= 0) return { delta, reason: "nothing to sell" };
  const soldOut = leftover <= Math.max(1, SOLD_OUT_TOLERANCE * offered * 10);
  if (soldOut) {
    if (delta <= 0) return { delta: FIRST_DELTA_OF_MARKET_PRICE * marketPrice, reason: "sold out at MP: first markup" };
    const factor = memory.calibrated ? PROBE_FACTOR_CALIBRATED : PROBE_FACTOR_UNCALIBRATED;
    return { delta: delta * factor, reason: "sold out: probing higher" };
  }
  if (delta <= 0) return { delta: 0, reason: "stock left even at MP" };
  memory.calibrated = true;
  const salesConstant = sold * delta ** 2;
  const target = Math.max(supply, sold) + leftover / 10;
  return { delta: Math.sqrt(salesConstant / target), reason: "stock left: price for supply + stock/10" };
}
