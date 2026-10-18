// Market-TA.II computed from the game's own sale formula (v3.0.1 src/Corporation/Division.ts processSaleState, helpers.ts
// calculateMarkupMultiplier). Needs Demand and Competition, which the API only shows with the "Market Research - Demand"
// and "Market Data - Competition" unlocks ($5b each); without them lib/corp-pricing.js probes instead.
// - Potential sales per second = quality factor x market factor x business factor x ABC SalesBots x advertising factor:
//   quality factor = material quality + 0.001, or product 0.5 x effectiveRating^0.65; market factor = max(0.1, demand x
//   (100 - competition) / 100); business factor = b^0.26 + b / 10000 with b = 1 + Business production of the office;
//   SalesBots = 1 + 0.01 x level; advertising factor = ((awareness+1)^a x (popularity+1)^a x ratio)^0.85, a = the industry's
//   advertising factor, ratio = max((popularity + 0.001) / awareness, 0.01) (0.01 without awareness).
// - Markup limit = material quality / base markup of the material, or product effectiveRating / product markup.
// - Above MP + markup limit the game sells potential x (markupLimit / (price - MP))^2, so the highest price that sells
//   `target` per second is MP + markupLimit x sqrt(potential / target) (what Market-TA.II sets).
// - The product markup is hidden but fixed per product: measured once from a cycle that left stock while priced above
//   MP + markup limit: markupLimit = (price - MP) x sqrt(sold / potential), markup = effectiveRating / markupLimit.

const SOLD_OUT_TOLERANCE = 0.01;
const DRAIN_CYCLES = { product: 5, material: 1 };

/**
 * @typedef {{kind: "product" | "material", marketPrice: number, delta: number, sold: number, supply: number, leftover: number,
 *   quality: number, demand?: number, competition?: number, businessProduction: number, salesBotsLevel: number,
 *   awareness: number, popularity: number, advertisingFactor: number, baseMarkup?: number}} MarketItem
 *   quality = material quality or product effective rating in this city; delta = current price above MP; sold, supply per second
 */

/** Potential sales per second of one item in one city (game formula), or null without demand/competition data. @param {MarketItem} item */
export function potentialSales(item) {
  if (item.demand === undefined || item.competition === undefined || item.demand === null || item.competition === null) return null;
  const qualityFactor = item.kind === "product" ? 0.5 * Math.max(item.quality, 0) ** 0.65 : item.quality + 0.001;
  const marketFactor = Math.max(0.1, item.demand * (100 - item.competition) / 100);
  const business = 1 + item.businessProduction;
  const businessFactor = business ** 0.26 + business / 10e3;
  const salesBots = 1 + 0.01 * item.salesBotsLevel;
  const ratio = item.awareness === 0 ? 0.01 : Math.max((item.popularity + 0.001) / item.awareness, 0.01);
  const advertising = ((item.awareness + 1) ** item.advertisingFactor * (item.popularity + 1) ** item.advertisingFactor * ratio) ** 0.85;
  return qualityFactor * marketFactor * businessFactor * salesBots * advertising;
}

/**
 * The Market-TA.II price above MP for one item in one city, or null when it cannot be computed yet (no demand data, or a
 * product whose markup is not measured and could not be measured from the last cycle): then probe instead.
 * @param {MarketItem} item @param {{markup?: number}} productMemory per product (shared by its cities), kept between calls
 * @returns {{delta: number, reason: string} | null}
 */
export function marketTa2Delta(item, productMemory) {
  const potential = potentialSales(item);
  if (potential === null || potential <= 0) return null;
  const offered = item.sold + item.leftover / 10;
  if (offered <= 0) return { delta: item.delta, reason: "nothing to sell" };
  const stockLeft = item.leftover > Math.max(1, SOLD_OUT_TOLERANCE * offered * 10);
  let markupLimit;
  if (item.kind === "material") markupLimit = item.quality / (item.baseMarkup || 1);
  else {
    // Measure the product markup when the last cycle was priced in the penalty range and left stock.
    if (!productMemory.markup && stockLeft && item.delta > 0 && item.sold > 0 && item.sold < 0.98 * potential) {
      const measuredLimit = item.delta * Math.sqrt(item.sold / potential);
      if (measuredLimit > 0) productMemory.markup = Math.max(item.quality, 0.001) / measuredLimit;
    }
    if (!productMemory.markup) return null;
    markupLimit = Math.max(item.quality, 0.001) / productMemory.markup;
  }
  // How well the formula predicted the last cycle (logged; 1.00 = exact): sold = potential x min(1, (limit / delta)^2).
  const predicted = item.delta > markupLimit ? potential * (markupLimit / item.delta) ** 2 : potential;
  const check = stockLeft ? `, last cycle sold ${(item.sold / predicted).toFixed(2)} x predicted` : "";
  const target = Math.max(item.supply, 1e-9) + item.leftover / (10 * DRAIN_CYCLES[item.kind]);
  return {
    delta: markupLimit * Math.sqrt(potential / target),
    reason: `TA2 formula: limit ${markupLimit.toPrecision(3)}, potential ${potential.toPrecision(3)}/s for ${target.toPrecision(3)}/s${check}`,
  };
}
