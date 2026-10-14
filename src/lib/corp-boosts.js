// Boost materials (Real Estate, Hardware, Robots, AI Cores) and warehouse size for one division, from the game's
// corporation guide ("# Boost material") and code:
// - City production multiplier = (prod over boosts of (1 + 0.002 * amount)^factor)^0.73: the optimal mix for a given
//   space S (Lagrange): amount_i = factor_i * K / size_i - 500, K = (S + 500 * sum(size)) / sum(factor), dropping
//   materials whose amount comes out negative and solving again.
// - Warehouse upgrade from level L by n levels costs sum over k < n of 1e9 * 1.07^(L + 1 + k); size is linear in level.

export const BOOST_MATERIALS = /** @type {const} */ (["Real Estate", "Hardware", "Robots", "AI Cores"]);
const WAREHOUSE_UPGRADE_BASE_COST = 1e9;
const WAREHOUSE_UPGRADE_COST_MULT = 1.07;
const MAX_EXTRA_LEVELS = 80;
// Space kept free for inputs and outputs even when the other contents need less than (1 - fill).
const MIN_FREE_SPACE_FRACTION = 0.1;

/**
 * Optimal boost amounts for a given warehouse space.
 * @param {number} space @param {Record<string, number>} factors per boost material @param {Record<string, number>} sizes
 * @returns {Record<string, number>}
 */
export function optimalBoosts(space, factors, sizes) {
  let used = BOOST_MATERIALS.filter((material) => (factors[material] ?? 0) > 0);
  while (used.length) {
    const factorSum = used.reduce((sum, material) => sum + factors[material], 0);
    const sizeSum = used.reduce((sum, material) => sum + sizes[material], 0);
    const k = (space + 500 * sizeSum) / factorSum;
    const amounts = Object.fromEntries(used.map((material) => [material, factors[material] * k / sizes[material] - 500]));
    const negative = used.filter((material) => amounts[material] < 0);
    if (!negative.length) return Object.fromEntries(BOOST_MATERIALS.map((material) => [material, Math.floor(amounts[material] ?? 0)]));
    used = used.filter((material) => !negative.includes(material));
  }
  return Object.fromEntries(BOOST_MATERIALS.map((material) => [material, 0]));
}

/** @param {number} level @param {number} levels */
export function warehouseUpgradeCost(level, levels) {
  let cost = 0;
  for (let step = 0; step < levels; step++) cost += WAREHOUSE_UPGRADE_BASE_COST * WAREHOUSE_UPGRADE_COST_MULT ** (level + 1 + step);
  return cost;
}

/**
 * @typedef {{city: string, level: number, size: number, sizeUsed: number, stored: Record<string, number>,
 *   prices: Record<string, number>}} WarehouseCity stored/prices per boost material (missing price: base cost)
 * @typedef {{city: string, levels: number, upgradeCost: number, purchases: Record<string, number>,
 *   purchaseCost: number, boostSpace: number, newSize: number}} CityPlan
 */

/**
 * Plan for one division: the highest common target level (at least each city's current one) whose upgrades plus the
 * boosts to fill `fill` of the space fit `budget`.
 * @param {WarehouseCity[]} cities @param {Record<string, number>} factors @param {Record<string, number>} sizes
 * @param {Record<string, number>} baseCosts @param {number} budget @param {number} fill
 * @returns {{targetLevel: number, cost: number, cities: CityPlan[]}}
 */
export function planBoosts(cities, factors, sizes, baseCosts, budget, fill) {
  const lowest = Math.min(...cities.map((city) => city.level));
  /** @type {{targetLevel: number, cost: number, cities: CityPlan[]}} */
  let best = { targetLevel: lowest, cost: 0, cities: [] };
  for (let targetLevel = lowest; targetLevel <= lowest + MAX_EXTRA_LEVELS; targetLevel++) {
    const plans = cities.map((city) => planCity(city, Math.max(targetLevel, city.level), factors, sizes, baseCosts, fill));
    const cost = plans.reduce((sum, plan) => sum + plan.upgradeCost + plan.purchaseCost, 0);
    if (cost > budget) break;
    best = { targetLevel, cost, cities: plans };
  }
  return best;
}

/**
 * @param {WarehouseCity} city @param {number} level @param {Record<string, number>} factors
 * @param {Record<string, number>} sizes @param {Record<string, number>} baseCosts @param {number} fill
 * @returns {CityPlan}
 */
function planCity(city, level, factors, sizes, baseCosts, fill) {
  const newSize = city.size * level / city.level;
  const boostSpaceNow = BOOST_MATERIALS.reduce((sum, material) => sum + (city.stored[material] ?? 0) * sizes[material], 0);
  const otherSpace = Math.max(0, city.sizeUsed - boostSpaceNow);
  const boostSpace = Math.max(0, Math.min(fill * newSize, newSize * (1 - MIN_FREE_SPACE_FRACTION) - otherSpace));
  const targets = optimalBoosts(boostSpace, factors, sizes);
  /** @type {Record<string, number>} */
  const purchases = {};
  let purchaseCost = 0;
  for (const material of BOOST_MATERIALS) {
    const amount = Math.max(0, Math.floor(targets[material] - (city.stored[material] ?? 0)));
    if (!amount) continue;
    purchases[material] = amount;
    purchaseCost += amount * (city.prices[material] ?? baseCosts[material]);
  }
  return { city: city.city, levels: level - city.level, upgradeCost: warehouseUpgradeCost(city.level, level - city.level), purchases, purchaseCost, boostSpace, newSize };
}
