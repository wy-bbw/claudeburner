// Boost materials (Real Estate, Hardware, Robots, AI Cores) and warehouse size for one division, from the game code
// (v3.0.1 src/Corporation/Division.ts calculateProductionFactors) and the corporation guide ("# Boost material"):
// - City production multiplier = (product over boosts of (1 + 0.002 * amount)^factor)^0.73; the division multiplier is the
//   sum over its cities. Maximizing it = maximizing sum of factor * ln(500 + amount) per city.
// - Empty warehouse, space S only (optimalBoosts, for tables): amount_i = factor_i * K / size_i - 500,
//   K = (S + 500 * sum(size)) / sum(factor), dropping materials whose amount comes out negative and solving again.
// - Buying onto existing stock with a space limit and a budget (bestBoostPurchase): what is held stays (nothing is sold);
//   KKT: amount_i = max(held_i, factor_i / (lambda * size_i + mu * price_i) - 500), lambda for the space, mu for the budget.
// - Warehouse upgrade from level L by n levels costs sum over k < n of 1e9 * 1.07^(L + 1 + k); size is linear in level.

export const BOOST_MATERIALS = /** @type {const} */ (["Real Estate", "Hardware", "Robots", "AI Cores"]);
const WAREHOUSE_UPGRADE_BASE_COST = 1e9;
const WAREHOUSE_UPGRADE_COST_MULT = 1.07;
const MAX_EXTRA_LEVELS = 80;
// Space kept free for inputs and outputs even when the other contents need less than (1 - fill).
const MIN_FREE_SPACE_FRACTION = 0.1;
const BISECTION_STEPS = 60;

/**
 * Optimal boost amounts for a given (empty) warehouse space.
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

/** A city's production multiplier from its boost stock (game formula, including the ^0.73). @param {Record<string, number>} amounts @param {Record<string, number>} factors */
export function boostMultiplier(amounts, factors) {
  let product = 1;
  for (const material of BOOST_MATERIALS) product *= (1 + 0.002 * Math.max(0, amounts[material] ?? 0)) ** (factors[material] ?? 0);
  return product ** 0.73;
}

/**
 * The best boost purchase on top of what a warehouse holds: at most `space` for all boost stock together (held + bought)
 * and at most `budget` spent (Infinity = space only, e.g. buying on debt). Held stock is kept, never sold.
 * @param {number} space @param {Record<string, number>} held @param {Record<string, number>} prices
 * @param {number} budget @param {Record<string, number>} factors @param {Record<string, number>} sizes
 * @returns {{purchases: Record<string, number>, cost: number, amounts: Record<string, number>}}
 */
export function bestBoostPurchase(space, held, prices, budget, factors, sizes) {
  const used = BOOST_MATERIALS.filter((material) => (factors[material] ?? 0) > 0);
  const heldOf = (/** @type {string} */ material) => Math.max(0, held[material] ?? 0);
  const amountsAt = (/** @type {number} */ lambda, /** @type {number} */ mu) => Object.fromEntries(used.map((material) =>
    [material, Math.max(heldOf(material), factors[material] / (lambda * sizes[material] + mu * prices[material]) - 500)]));
  const spaceOf = (/** @type {Record<string, number>} */ amounts) => used.reduce((sum, material) => sum + amounts[material] * sizes[material], 0);
  const costOf = (/** @type {Record<string, number>} */ amounts) => used.reduce((sum, material) => sum + (amounts[material] - heldOf(material)) * prices[material], 0);
  const nothing = { purchases: {}, cost: 0, amounts: Object.fromEntries(used.map((material) => [material, heldOf(material)])) };
  const heldSpace = used.reduce((sum, material) => sum + heldOf(material) * sizes[material], 0);
  if (!used.length || heldSpace >= space || budget <= 0) return nothing;
  // Smallest multiplier (log bisection) whose amounts fit: amounts fall as the multiplier grows.
  const smallestFitting = (/** @type {(x: number) => boolean} */ fits) => {
    let low = 1e-30, high = 1e10;
    for (let step = 0; step < BISECTION_STEPS; step++) {
      const middle = Math.sqrt(low * high);
      if (fits(middle)) high = middle; else low = middle;
    }
    return high;
  };
  // Space price lambda for a budget price mu: 0 when the budget alone keeps the stock inside the space.
  const lambdaFor = (/** @type {number} */ mu) => (mu > 0 && spaceOf(amountsAt(0, mu)) <= space) ? 0
    : smallestFitting((lambda) => spaceOf(amountsAt(lambda, mu)) <= space);
  let mu = 0, lambda = lambdaFor(0);
  if (costOf(amountsAt(lambda, 0)) > budget) {
    mu = smallestFitting((candidate) => costOf(amountsAt(lambdaFor(candidate), candidate)) <= budget);
    lambda = lambdaFor(mu);
  }
  const amounts = amountsAt(lambda, mu);
  /** @type {Record<string, number>} */
  const purchases = {};
  let cost = 0;
  for (const material of used) {
    const amount = Math.floor(amounts[material] - heldOf(material));
    if (amount <= 0) continue;
    purchases[material] = amount;
    cost += amount * prices[material];
  }
  return { purchases, cost, amounts: Object.fromEntries(used.map((material) => [material, heldOf(material) + (purchases[material] ?? 0)])) };
}

/**
 * Space for boost stock in a warehouse of `size`: `fill` of it, but always MIN_FREE_SPACE_FRACTION free after what is
 * there besides boosts (inputs, outputs).
 * @param {number} size @param {number} otherSpace space used by everything that is not a boost material @param {number} fill
 */
export function boostSpaceFor(size, otherSpace, fill) {
  return Math.max(0, Math.min(fill * size, size * (1 - MIN_FREE_SPACE_FRACTION) - otherSpace));
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
 *   purchaseCost: number, boostSpace: number, newSize: number, multiplier: number}} CityPlan
 */

/**
 * Plan for one division within `budget`: the common target level (at least each city's current one) whose upgrades plus
 * the best boost purchase with the rest of the budget (split evenly over the cities) give the highest production
 * multiplier. A budget that cannot fill the space still buys the best partial mix.
 * @param {WarehouseCity[]} cities @param {Record<string, number>} factors @param {Record<string, number>} sizes
 * @param {Record<string, number>} baseCosts @param {number} budget @param {number} fill
 * @returns {{targetLevel: number, cost: number, cities: CityPlan[], multiplier: number}}
 */
export function planBoosts(cities, factors, sizes, baseCosts, budget, fill) {
  const lowest = Math.min(...cities.map((city) => city.level));
  /** @type {{targetLevel: number, cost: number, cities: CityPlan[], multiplier: number} | null} */
  let best = null;
  for (let targetLevel = lowest; targetLevel <= lowest + MAX_EXTRA_LEVELS; targetLevel++) {
    const upgradeCost = cities.reduce((sum, city) => sum + warehouseUpgradeCost(city.level, Math.max(0, targetLevel - city.level)), 0);
    if (upgradeCost > budget) break;
    const perCity = (budget - upgradeCost) / cities.length;
    const plans = cities.map((city) => planCity(city, Math.max(targetLevel, city.level), factors, sizes, baseCosts, fill, perCity));
    const multiplier = plans.reduce((sum, plan) => sum + plan.multiplier, 0);
    const cost = plans.reduce((sum, plan) => sum + plan.upgradeCost + plan.purchaseCost, 0);
    if (!best || multiplier > best.multiplier * (1 + 1e-9)) best = { targetLevel, cost, cities: plans, multiplier };
  }
  return best ?? { targetLevel: lowest, cost: 0, cities: [], multiplier: 0 };
}

/**
 * @param {WarehouseCity} city @param {number} level @param {Record<string, number>} factors
 * @param {Record<string, number>} sizes @param {Record<string, number>} baseCosts @param {number} fill @param {number} budget
 * @returns {CityPlan}
 */
function planCity(city, level, factors, sizes, baseCosts, fill, budget) {
  const newSize = city.size * level / city.level;
  const boostSpaceNow = BOOST_MATERIALS.reduce((sum, material) => sum + (city.stored[material] ?? 0) * sizes[material], 0);
  const boostSpace = boostSpaceFor(newSize, Math.max(0, city.sizeUsed - boostSpaceNow), fill);
  const prices = Object.fromEntries(BOOST_MATERIALS.map((material) => [material, city.prices[material] || baseCosts[material]]));
  const purchase = bestBoostPurchase(boostSpace, city.stored, prices, budget, factors, sizes);
  return { city: city.city, levels: level - city.level, upgradeCost: warehouseUpgradeCost(city.level, level - city.level),
    purchases: purchase.purchases, purchaseCost: purchase.cost, boostSpace, newSize, multiplier: boostMultiplier(purchase.amounts, factors) };
}
