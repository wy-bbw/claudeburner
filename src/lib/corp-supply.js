// Input supply with buy orders instead of the Smart Supply unlock. The game's Smart Supply (v3.0.1
// src/Corporation/Division.ts, PURCHASE state) buys, per required material, requiredQuantity x last cycle's production
// (before input shortages, limited by space) x 10 s, aligned to the scarcest material, shrunk to the free space, minus
// the stock ("leftovers") or minus the imports ("imports").
// Here the same from what the API shows after a cycle's SALE state: an input's productionAmount is -(consumption per
// second), so consumption / requiredQuantity is the production rate. It equals the potential production unless an input
// ran out (production limited by producibleFrac, the limiting input then left at ~0): then the estimate doubles until the
// stock no longer runs out. A buy order set now is paid in the next PURCHASE state (10 s x rate, no funds check).
// State order (Constants.ts stateNames): START, PURCHASE, PRODUCTION, EXPORT, SALE. Imports arrive in EXPORT, after
// production, so after SALE they are already in the stock (and usable only next cycle): the stock covers them, nothing
// extra is subtracted (= Smart Supply's "leftovers"). Exports leave before SALE too, so the stock read is net of them.
// Imported inputs: bought market material has quality 1 and dilutes the imported quality (output quality is capped at
// the average input quality x sqrt(potential quality)). While the exporter has some left over after exporting, the
// import covers the whole need and the input is bought only to start production (nothing produced = IPROD 0 = no
// export) or as a small probe when the import was used up: the need-based export (IPROD+IINV/10)*(-1) sends exactly the
// last consumption, so without the probe production could never grow. When the exporter is used up, the shortfall is
// bought as for any other input (2026-11-08: buying everything let the importer's stock push the export to 0).

export const SECONDS_PER_CYCLE = 10;
/** Stock above the next cycle's need, so that a full stock is told apart from a used-up one. */
const HEADROOM = 1.1;
/** Production estimate (units per second) to start from when nothing has been produced yet. */
const SEED_RATE = 10;
const GROWTH_WHEN_SHORT = 2;
/** An input counts as used up below this share of a cycle's need. */
const SHORT_SHARE = 0.01;
/** Share of the warehouse the buys leave free (the produced materials need room too). */
const KEEP_FREE_SHARE = 0.05;
/** Share of a cycle's need bought on top of a used-up import, so that production can grow past the last consumption. */
const PROBE_SHARE = 0.1;

/**
 * @typedef {{name: string, stored: number, productionAmount: number, importAmount?: number}} MaterialRow
 * @typedef {{material: string, rate: number}} BuyOrder
 * @typedef {"surplus" | "used-up"} ImportStatus surplus: the exporter had some left over after exporting
 */

/**
 * Buy orders for one warehouse for the next cycle.
 * @param {Record<string, number>} required required quantity per unit produced, per input material
 * @param {Record<string, number>} sizes storage size per unit, per input material
 * @param {{size: number, sizeUsed: number}} warehouse after the SALE state
 * @param {MaterialRow[]} rows this warehouse's materials after the SALE state
 * @param {number} previousEstimate production estimate (units per second) of the last cycle, 0 at the start
 * @param {Record<string, ImportStatus>} [imports] inputs other divisions export to this warehouse
 * @returns {{orders: BuyOrder[], estimate: number, actual: number, short: boolean}}
 */
export function planSupply(required, sizes, warehouse, rows, previousEstimate, imports = {}) {
  const inputs = Object.entries(required).filter(([, quantity]) => quantity > 0);
  const row = (/** @type {string} */ material) => rows.find((entry) => entry.name === material);
  const stored = (/** @type {string} */ material) => row(material)?.stored ?? 0;
  const consumption = (/** @type {string} */ material) => Math.max(0, -(row(material)?.productionAmount ?? 0));
  const covered = (/** @type {string} */ material) => imports[material] === "surplus";

  const actual = Math.max(0, ...inputs.map(([material, quantity]) => consumption(material) / quantity));
  const reference = Math.max(actual, previousEstimate);
  const short = inputs.some(([material, quantity]) => !covered(material) && stored(material) <= SHORT_SHARE * quantity * reference * SECONDS_PER_CYCLE);
  const estimate = short ? Math.max(SEED_RATE, reference * GROWTH_WHEN_SHORT) : actual;

  /** A covered import: a seed while nothing is produced, a probe when the import was used up, else nothing. */
  const coveredAmount = (/** @type {string} */ material, /** @type {number} */ quantity) => {
    if (actual === 0) return Math.max(0, quantity * SEED_RATE * SECONDS_PER_CYCLE - stored(material));
    const need = quantity * actual * SECONDS_PER_CYCLE;
    const leftover = stored(material) - (row(material)?.importAmount ?? 0) * SECONDS_PER_CYCLE;
    return leftover <= SHORT_SHARE * need ? PROBE_SHARE * need : 0;
  };
  // Units to buy: next cycle's need plus headroom, minus the stock (which already holds this cycle's imports).
  const buys = inputs.map(([material, quantity]) => ({ material, amount: covered(material) ? coveredAmount(material, quantity)
    : Math.max(0, quantity * estimate * SECONDS_PER_CYCLE * HEADROOM - stored(material)) }));
  const space = buys.reduce((sum, buy) => sum + buy.amount * (sizes[buy.material] ?? 0), 0);
  const free = Math.max(0, warehouse.size - warehouse.sizeUsed - KEEP_FREE_SHARE * warehouse.size);
  const scale = space > free ? free / space : 1;
  const orders = buys.map((buy) => ({ material: buy.material, rate: Math.floor(buy.amount * scale) / SECONDS_PER_CYCLE }));
  // The next cycle's reference is what was actually bought for: while the space shrinks the orders (a full warehouse:
  // to 0), a growing estimate would double every cycle without bound (2026-11-08: SHORT with 959 Plants in stock).
  return { orders, estimate: scale < 1 ? Math.max(actual, estimate * scale) : estimate, actual, short };
}
