import { boostMultiplier, optimalBoosts, warehouseUpgradeCost } from "lib/corp-boosts.js";
import { upgradeCost } from "lib/corp-upgrades.js";
import { jobSplit, officeUpgradeCost } from "lib/corp-offices.js";

// Spending a budget on production for a material division (game code v3.0.1): production per city =
//   office productivity x boost multiplier x (1 + 0.03 x Smart Factories),
//   office productivity = (Ops^0.4 + Eng^0.3) x (1 + Mgmt / (1.2 x (Ops + Eng + Mgmt))) (Division.ts getOfficeProductivity;
//   Ops/Eng/Mgmt = summed employee production of that job), boost multiplier from the fill of a warehouse of
//   level x 100 x (1 + 0.1 x Smart Storage) (Warehouse.ts updateSize, lib/corp-boosts.js).
// The factors multiply and the costs add, so each part is a list of (cost, factor) options; their Pareto frontiers are
// combined pairwise and the best combination within the budget wins. Same office size and warehouse level in every city.

const SMART_FACTORIES_BENEFIT = 0.03, SMART_STORAGE_BENEFIT = 0.1;
const SEARCH_LEVELS = 40;
const SEARCH_EMPLOYEES = 90;

/** @typedef {{cost: number, value: number, choice: Record<string, number>}} Option */

/** Options sorted by cost, keeping only those worth more than every cheaper one. @param {Option[]} options */
function frontier(options) {
  const sorted = [...options].sort((a, b) => a.cost - b.cost || b.value - a.value);
  /** @type {Option[]} */
  const kept = [];
  for (const option of sorted) if (!kept.length || option.value > kept[kept.length - 1].value) kept.push(option);
  return kept;
}

/** Every pair within the budget: costs add, factors multiply. @param {Option[]} first @param {Option[]} second @param {number} budget */
function combine(first, second, budget) {
  /** @type {Option[]} */
  const pairs = [];
  for (const a of first) for (const b of second) {
    if (a.cost + b.cost > budget) break;
    pairs.push({ cost: a.cost + b.cost, value: a.value * b.value, choice: { ...a.choice, ...b.choice } });
  }
  return frontier(pairs);
}

/**
 * Office productivity (without the 0.05 balancing factor) of `size` employees split by `weights` (lib/corp-offices.js
 * jobSplit, interns from 9 on), each producing `employeeProduction` in its job.
 * @param {number} size @param {Record<string, number>} weights @param {number} employeeProduction
 */
export function officeProductivity(size, weights, employeeProduction) {
  const jobs = jobSplit(size, weights);
  const operations = jobs.Operations * employeeProduction, engineers = jobs.Engineer * employeeProduction;
  const management = jobs.Management * employeeProduction;
  const total = operations + engineers + management;
  if (total <= 0) return 0;
  return (operations ** 0.4 + engineers ** 0.3) * (1 + management / (1.2 * total));
}

/**
 * @param {{levels: number[], officeSizes: number[], smartStorage: number, smartFactories: number}} current per city: warehouse
 *   level and office size; corporation upgrade levels
 * @param {number} budget @param {number} fill warehouse share for boosts @param {Record<string, number>} factors boost factors
 * @param {Record<string, number>} sizes @param {Record<string, number>} weights job weights @param {number} employeeProduction
 * @returns {{level: number, smartStorage: number, smartFactories: number, officeSize: number, cost: number, production: number, baseline: number}}
 */
export function bestGrowthPlan(current, budget, fill, factors, sizes, weights, employeeProduction) {
  const boost = (/** @type {number} */ level, /** @type {number} */ storage) =>
    boostMultiplier(optimalBoosts(fill * 100 * level * (1 + SMART_STORAGE_BENEFIT * storage), factors, sizes), factors);
  const startLevel = Math.max(1, ...current.levels);
  const startSize = Math.max(...current.officeSizes);

  /** @type {Option[]} */
  const storage = [];
  let storageCost = 0;
  for (let smartStorage = current.smartStorage; smartStorage <= current.smartStorage + SEARCH_LEVELS; smartStorage++) {
    if (smartStorage > current.smartStorage) storageCost += upgradeCost("Smart Storage", smartStorage - 1);
    for (let level = startLevel; level <= startLevel + SEARCH_LEVELS; level++) {
      const cost = storageCost + current.levels.reduce((sum, cityLevel) => sum + warehouseUpgradeCost(cityLevel, Math.max(0, level - cityLevel)), 0);
      if (cost > budget) break;
      storage.push({ cost, value: boost(level, smartStorage), choice: { level, smartStorage } });
    }
  }
  /** @type {Option[]} */
  const factories = [];
  let factoriesCost = 0;
  for (let smartFactories = current.smartFactories; smartFactories <= current.smartFactories + SEARCH_LEVELS && factoriesCost <= budget; smartFactories++) {
    if (smartFactories > current.smartFactories) factoriesCost += upgradeCost("Smart Factories", smartFactories - 1);
    factories.push({ cost: factoriesCost, value: 1 + SMART_FACTORIES_BENEFIT * smartFactories, choice: { smartFactories } });
  }
  /** @type {Option[]} */
  const offices = [];
  for (let officeSize = startSize; officeSize <= startSize + SEARCH_EMPLOYEES; officeSize++) {
    const cost = current.officeSizes.reduce((sum, size) => sum + officeUpgradeCost(size, Math.max(0, officeSize - size)), 0);
    if (cost > budget) break;
    offices.push({ cost, value: officeProductivity(officeSize, weights, employeeProduction), choice: { officeSize } });
  }

  const combined = combine(combine(frontier(storage), frontier(factories), budget), frontier(offices), budget);
  const best = combined[combined.length - 1];
  const baseline = boost(startLevel, current.smartStorage) * (1 + SMART_FACTORIES_BENEFIT * current.smartFactories)
    * officeProductivity(startSize, weights, employeeProduction);
  return { level: best.choice.level, smartStorage: best.choice.smartStorage, smartFactories: best.choice.smartFactories,
    officeSize: best.choice.officeSize, cost: best.cost, production: best.value, baseline };
}

// Revenue instead of production (Market-TA.II prices, lib/corp-market.js): selling x per second of a material earns
// x x MP + markupLimit x sqrt(potential x x) per second (TA.II sets price = MP + markupLimit x sqrt(potential / x)).
// x scales with production; potential = quality x market x business factor x SalesBots x advertising, of which the plan
// changes the business factor (b^0.26 + b/1e4, b = 1 + Business job production: more employees, the weights' Business
// share) and ABC SalesBots (1 + 0.01 x level). Advert barely moves potential for industries with a small advertising
// factor (Agriculture 0.04) and is bought separately.

const SALES_BOTS = "ABC SalesBots", SALES_BOTS_BENEFIT = 0.01;

/** @param {number} businessProduction */
const businessFactor = (businessProduction) => (1 + businessProduction) ** 0.26 + (1 + businessProduction) / 10e3;

/**
 * @typedef {{production: number, marketPrice: number, markupLimit: number, potential: number}} SaleItem one produced
 *   material in one city now: production and potential sales per second
 * @typedef {{items: SaleItem[], operations: number, engineers: number, management: number, business: number}} SaleCity
 *   a city's items and its office's job production now
 */

/** Office productivity from job production. @param {number} operations @param {number} engineers @param {number} management */
function productivityOf(operations, engineers, management) {
  const total = operations + engineers + management;
  return total > 0 ? (operations ** 0.4 + engineers ** 0.3) * (1 + management / (1.2 * total)) : 0;
}

/**
 * Like bestGrowthPlan, but maximizes revenue per second under Market-TA.II and also chooses ABC SalesBots.
 * @param {{levels: number[], officeSizes: number[], smartStorage: number, smartFactories: number, salesBots: number}} current
 * @param {number} budget @param {number} fill @param {Record<string, number>} factors @param {Record<string, number>} sizes
 * @param {Record<string, number>} weights @param {number} employeeProduction @param {SaleCity[]} cities
 * @returns {{level: number, smartStorage: number, smartFactories: number, officeSize: number, salesBots: number, cost: number,
 *   revenue: number, baselineRevenue: number, machinery: number}} machinery = production factor of warehouses and upgrades against now
 */
export function bestRevenuePlan(current, budget, fill, factors, sizes, weights, employeeProduction, cities) {
  const boost = (/** @type {number} */ level, /** @type {number} */ storage) =>
    boostMultiplier(optimalBoosts(fill * 100 * level * (1 + SMART_STORAGE_BENEFIT * storage), factors, sizes), factors);
  const startLevel = Math.max(1, ...current.levels);
  const startSize = Math.max(...current.officeSizes);

  // Warehouse/Smart Storage/Smart Factories only multiply production: one frontier of (cost, production factor).
  /** @type {Option[]} */
  const storage = [];
  let storageCost = 0;
  for (let smartStorage = current.smartStorage; smartStorage <= current.smartStorage + SEARCH_LEVELS; smartStorage++) {
    if (smartStorage > current.smartStorage) storageCost += upgradeCost("Smart Storage", smartStorage - 1);
    for (let level = startLevel; level <= startLevel + SEARCH_LEVELS; level++) {
      const cost = storageCost + current.levels.reduce((sum, cityLevel) => sum + warehouseUpgradeCost(cityLevel, Math.max(0, level - cityLevel)), 0);
      if (cost > budget) break;
      storage.push({ cost, value: boost(level, smartStorage), choice: { level, smartStorage } });
    }
  }
  /** @type {Option[]} */
  const factories = [];
  let factoriesCost = 0;
  for (let smartFactories = current.smartFactories; smartFactories <= current.smartFactories + SEARCH_LEVELS && factoriesCost <= budget; smartFactories++) {
    if (smartFactories > current.smartFactories) factoriesCost += upgradeCost("Smart Factories", smartFactories - 1);
    factories.push({ cost: factoriesCost, value: 1 + SMART_FACTORIES_BENEFIT * smartFactories, choice: { smartFactories } });
  }
  const machinery = combine(frontier(storage), frontier(factories), budget);
  const machineryNow = boost(startLevel, current.smartStorage) * (1 + SMART_FACTORIES_BENEFIT * current.smartFactories);

  /** Revenue per second with an office of `size` (weights split), `bots` SalesBots and a machinery factor. */
  const revenueOf = (/** @type {number} */ size, /** @type {number} */ bots, /** @type {number} */ machineryFactor) => {
    const jobs = size === null ? null : jobSplit(size, weights);
    let revenue = 0;
    for (const city of cities) {
      const officeNow = productivityOf(city.operations, city.engineers, city.management);
      const officeNew = jobs ? productivityOf(jobs.Operations * employeeProduction, jobs.Engineer * employeeProduction, jobs.Management * employeeProduction) : officeNow;
      const productionRatio = officeNow > 0 ? officeNew * machineryFactor / (officeNow * machineryNow) : 0;
      const businessNew = jobs ? jobs.Business * employeeProduction : city.business;
      const potentialRatio = businessFactor(businessNew) / businessFactor(city.business)
        * (1 + SALES_BOTS_BENEFIT * bots) / (1 + SALES_BOTS_BENEFIT * current.salesBots);
      for (const item of city.items) {
        const sold = item.production * productionRatio;
        revenue += sold * item.marketPrice + item.markupLimit * Math.sqrt(Math.max(0, item.potential * potentialRatio * sold));
      }
    }
    return revenue;
  };

  const baselineRevenue = revenueOf(/** @type {any} */ (null), current.salesBots, machineryNow);
  let best = { level: startLevel, smartStorage: current.smartStorage, smartFactories: current.smartFactories, officeSize: startSize,
    salesBots: current.salesBots, cost: 0, revenue: baselineRevenue, machinery: 1 };
  let botsCost = 0;
  for (let bots = current.salesBots; bots <= current.salesBots + SEARCH_LEVELS && botsCost <= budget; bots++) {
    if (bots > current.salesBots) botsCost += upgradeCost(SALES_BOTS, bots - 1);
    for (let size = startSize; size <= startSize + SEARCH_EMPLOYEES; size++) {
      const officeCost = current.officeSizes.reduce((sum, officeSize) => sum + officeUpgradeCost(officeSize, Math.max(0, size - officeSize)), 0);
      const left = budget - botsCost - officeCost;
      if (left < 0) break;
      // Revenue rises with the machinery factor: take the best machinery the rest affords (frontier sorted by cost).
      let low = 0, high = machinery.length - 1;
      if (!machinery.length || machinery[0].cost > left) continue;
      while (low < high) { const middle = (low + high + 1) >> 1; if (machinery[middle].cost <= left) low = middle; else high = middle - 1; }
      const option = machinery[low];
      const revenue = revenueOf(size, bots, option.value);
      if (revenue > best.revenue) {
        best = { level: option.choice.level, smartStorage: option.choice.smartStorage, smartFactories: option.choice.smartFactories,
          officeSize: size, salesBots: bots, cost: botsCost + officeCost + option.cost, revenue, machinery: option.value / machineryNow };
      }
    }
  }
  return { ...best, baselineRevenue };
}
