// Sell prices like Market-TA.II, without the 70k RP research (formulas: the game's corporation guide and code).
// Above MP + MarkupLimit the game sells Potential * (MarkupLimit / (price - MP))^2 per second. MarkupLimit needs the
// hidden product markup, but Potential * MarkupLimit^2 = C can be measured from one cycle that did not sell out:
// C = sold * (price - MP)^2. The highest price that still sells `supply` per second is then MP + sqrt(C / supply).
// While everything sells, C is unknown (only a lower bound): raise the price step by step until a little stock is left.
// Prices are set as "MP+<delta>", so the game follows market price changes by itself.

// Start low: a material's markup limit (quality / markup) is often only a few % of MP, and one unsold cycle can fill a warehouse.
const FIRST_DELTA_OF_MARKET_PRICE = 0.01;
// Probe steps while everything sells out. Products: far above MP (hundreds of x) and their demand keeps growing with
// Advert, so bigger steps; one unsold cycle of a product costs little. Materials: careful (a full warehouse stops production).
const PROBE_FACTORS = { product: { uncalibrated: 3, calibrated: 1.15 }, material: { uncalibrated: 1.5, calibrated: 1.05 } };
// Leftover stock is sold off over this many cycles: one for materials (warehouse space), five for products (draining
// in one cycle would push the price down hard after every overshoot).
const DRAIN_CYCLES = { product: 5, material: 1 };
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
 * @param {{marketPrice: number, delta: number, sold: number, supply: number, leftover: number, startDelta?: number,
 *   kind?: "product" | "material"}} item
 *   sold and supply per second over the last cycle (supply = what will come in for sale), leftover = units stored
 *   right after the last sale; startDelta = the least to jump to while everything sells out (the price of the best
 *   older product in the same city: a newer product is better, so it sells at least as well at that price)
 * @param {{calibrated?: boolean}} memory per item, kept between calls
 * @returns {{delta: number, reason: string}}
 */
export function nextPriceDelta(item, memory) {
  const { marketPrice, delta, sold, supply, leftover } = item;
  const offered = sold + leftover / 10;
  if (offered <= 0) return { delta, reason: "nothing to sell" };
  const soldOut = leftover <= Math.max(1, SOLD_OUT_TOLERANCE * offered * 10);
  if (soldOut) {
    const factors = PROBE_FACTORS[item.kind ?? "material"];
    const factor = memory.calibrated ? factors.calibrated : factors.uncalibrated;
    const probedDelta = delta <= 0 ? FIRST_DELTA_OF_MARKET_PRICE * marketPrice : delta * factor;
    if ((item.startDelta ?? 0) > probedDelta) return { delta: item.startDelta ?? 0, reason: "sold out: up to the best older product's price" };
    return { delta: probedDelta, reason: delta <= 0 ? "sold out at MP: first markup" : "sold out: probing higher" };
  }
  if (delta <= 0) return { delta: 0, reason: "stock left even at MP" };
  memory.calibrated = true;
  const salesConstant = sold * delta ** 2;
  const drainCycles = DRAIN_CYCLES[item.kind ?? "material"];
  const target = Math.max(supply, sold) + leftover / (10 * drainCycles);
  return { delta: Math.sqrt(salesConstant / target), reason: `stock left: price for supply + stock over ${drainCycles} cycle(s)` };
}
