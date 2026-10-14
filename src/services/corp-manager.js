import { appendLog, formatTime } from "lib/log.js";
import { runAction, runReader } from "lib/corp-scripts.js";
import { BOOST_MATERIALS, planBoosts } from "lib/corp-boosts.js";
import { AUTO_UPGRADES, planUpgrades } from "lib/corp-upgrades.js";
import { JOBS, jobSplit, largestAffordableSize, officeUpgradeCost } from "lib/corp-offices.js";
import { formatPrice, nextPriceDelta, parsePriceDelta } from "lib/corp-pricing.js";

const STATE_FILE = "data/corp-state.txt";
const LOG_FILE = "data/corp-manager.txt";
const PRICES_FILE = "data/corp-prices.txt";
const REQUESTS_FILE = "data/corp-requests.txt";
// Which prices are calibrated (lib/corp-pricing.js memory), kept across restarts: uncalibrated prices probe x3.
const PRICE_MEMORY_FILE = "data/corp-price-memory.txt";
const INTERVAL_MS = 5_000;
const WILSON = "Wilson Analytics";
// Upgrade cost = base price x price multiplier ^ level (game code).
const WILSON_BASE_PRICE = 4e9, WILSON_PRICE_MULT = 2;
const ADVERT_BASE_PRICE = 1e9, ADVERT_PRICE_MULT = 1.06;
const MAX_ADVERTS_PER_ROUND = 20;
// Tea / party when energy or morale is this far below the maximum.
const TOP_UP_MARGIN = 2;

/**
 * @typedef {{division: string, city: CityName, name: string, developmentProgress: number, rating: number,
 *   desiredSellAmount: string | number, desiredSellPrice: string | number, stored: number, productionAmount: number,
 *   actualSellAmount: number, productionCost: number}} ProductData one product in one city (workers/corp-read-products.js)
 * @typedef {{division: string, city: CityName, name: string, stored: number, productionAmount: number,
 *   actualSellAmount: number, marketPrice: number, desiredSellAmount?: string | number,
 *   desiredSellPrice?: string | number}} MaterialData (workers/corp-read-materials.js)
 * @typedef {{division: string, city: CityName, numEmployees: number, avgEnergy: number, maxEnergy: number,
 *   avgMorale: number, maxMorale: number}} OfficeData (workers/corp-read-offices.js)
 */

// corp-manager.js (home): runs the corporation's routine work, the round 3+ loop of the corporation guide:
// - Products of --division: always one in development in --city; when all product slots are full, the product with
//   the lowest rating is discontinued first. Design and marketing investment: --invest-fraction of funds each.
//   Finished products get a sell order (MAX) in all cities.
// - Prices like Market-TA.II for every product and every produced material that sells "MAX" at "MP" or "MP+x"
//   (lib/corp-pricing.js), without the 70k RP research. Prices set by hand are left alone. Once Market-TA.II is
//   researched, products use the game's own. --fixed-material-prices leaves materials alone.
// - Energy and morale: tea and a party for every office more than 2 below the maximum (what the AutoBrew and
//   AutoPartyManager research do, without spending RP).
// - Wilson Analytics when it costs <= --wilson-fraction of funds, then Advert levels for --division while each costs
//   <= --advert-fraction of funds (Wilson first: it multiplies every later Advert).
// Decisions use data/corp-state.txt (services/corp-status.js, every 20 s); after acting it waits for a newer state.
// Every action is its own 20 GB worker (workers/corp-do-*.js). Log: data/corp-manager.txt; current prices:
// data/corp-prices.txt (rewritten every pricing round).
// - Requests queued by tools in data/corp-requests.txt (JSON lines), one per round so each sees a fresh state:
//   tools/corp-boosts.js (warehouse levels + optimal boost materials), tools/corp-upgrades.js (corporation upgrades),
//   tools/corp-office.js (office size, hiring, job split).
// --reinvest-minutes N queues upgrades (20% of funds), main office (15%), all offices (10%) and boosts (10%) every N
// minutes (each request spends its share of the funds when it runs).
// --hold-upgrades stops Wilson/Advert purchases (e.g. while waiting for an investment offer: spending lowers it).
// Usage: run services/corp-manager.js [--division tobacco] [--city Aevum]
/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  const flags = ns.flags([
    ["division", "tobacco"],
    ["city", "Aevum"],
    ["invest-fraction", 0.01],
    ["wilson-fraction", 0.2],
    ["advert-fraction", 0.1],
    ["hold-upgrades", false],
    ["fixed-material-prices", false],
    ["reinvest-minutes", 0],
  ]);
  const division = String(flags.division), mainCity = /** @type {CityName} */ (String(flags.city));
  /** Products that already have Market-TA.II turned on (not visible in the product data). */
  const marketTa2Products = new Set();
  /** @type {Map<string, {calibrated?: boolean}>} pricing memory per item and city */
  const priceMemory = new Map(Object.entries(readJson(ns, PRICE_MEMORY_FILE) ?? {}));
  let lastStateTime = 0, lastPriceChange = 0, lastRequestTime = 0, lastReinvest = Date.now(), lastWaiting = "";
  const log = (/** @type {string} */ event, /** @type {string} */ details) => appendLog(ns, LOG_FILE, event, details);
  const waiting = (/** @type {string} */ reason) => {
    if (reason !== lastWaiting) log("waiting", reason);
    lastWaiting = reason;
  };
  log("start", `division ${division}, main city ${mainCity}, flags ${JSON.stringify(ns.args)}`);

  while (true) {
    await ns.sleep(INTERVAL_MS);
    const state = readState(ns);
    if (!state || state.time <= lastStateTime) continue;
    let acted = false;

    // --reinvest-minutes: queue the growth requests regularly (each spends a share of the funds at that moment).
    const reinvestMinutes = Number(flags["reinvest-minutes"]);
    if (reinvestMinutes > 0 && Date.now() - lastReinvest > reinvestMinutes * 60_000 && !ns.read(REQUESTS_FILE).trim()) {
      lastReinvest = Date.now();
      const time = Date.now();
      const reinvest = [
        { type: "upgrades", names: AUTO_UPGRADES, budgetFraction: 0.2, time },
        { type: "office", division, city: mainCity, size: 0, budgetFraction: 0.15, jobs: null, time },
        { type: "office", division, city: "all", size: 0, budgetFraction: 0.1, jobs: null, time },
        { type: "boosts", division, budgetFraction: 0.1, fill: 0.6, time },
      ];
      ns.write(REQUESTS_FILE, reinvest.map((request) => JSON.stringify(request) + "\n").join(""), "a");
      log("reinvest", "queued upgrades 20%, main office 15%, all offices 10%, boosts 10% of funds");
    }

    // Requests from tools (they only queue a line: the workers need the RAM a running tool would take).
    // Only on a state read entirely after the previous request: a request must see what the last one changed.
    const requests = (state.readStartTime ?? 0) > lastRequestTime ? ns.read(REQUESTS_FILE).split("\n").filter((line) => line.trim()) : [];
    if (requests.length) {
      ns.write(REQUESTS_FILE, requests.slice(1).map((line) => line + "\n").join(""), "w");
      let request = null;
      try { request = JSON.parse(requests[0]); } catch { log("failed", `unreadable request ${requests[0]}`); }
      if (request?.type === "boosts") await buyBoosts(ns, log, state, request);
      else if (request?.type === "upgrades") await buyUpgrades(ns, log, state, request);
      else if (request?.type === "office") await growOffices(ns, log, state, request);
      else if (request) log("failed", `unknown request ${JSON.stringify(request)}`);
      lastRequestTime = Date.now();
      acted = true;
    }

    // Energy and morale (production is multiplied by both): tea and a party sized to bring morale back to the maximum.
    const tired = (state.offices ?? []).filter((/** @type {OfficeData} */ office) => office.numEmployees > 0 && office.avgEnergy < office.maxEnergy - TOP_UP_MARGIN);
    const unhappy = (state.offices ?? []).filter((/** @type {OfficeData} */ office) => office.numEmployees > 0 && office.avgMorale < office.maxMorale - TOP_UP_MARGIN);
    if (tired.length) await report(ns, log, "buy-tea", tired.map((/** @type {OfficeData} */ office) => [office.division, office.city]), false);
    if (unhappy.length) {
      // throwParty: morale = (morale + 10 * (m - 1)) * m with m = 1 + costPerEmployee / 1e7; aim for m = max / morale.
      await report(ns, log, "throw-party", unhappy.map((/** @type {OfficeData} */ office) =>
        [office.division, office.city, Math.ceil((office.maxMorale / office.avgMorale - 1) * 1e7)]), false);
    }
    if (tired.length || unhappy.length) acted = true;

    // Prices: only judge a price on sales made after it was set (the readers wait for a SALE after readStartTime).
    if ((state.readStartTime ?? 0) > lastPriceChange) {
      const researchedTa2 = (/** @type {string} */ divisionName) => ((state.researchStatus ?? [])
        .find((/** @type {{division: string}} */ entry) => entry.division === divisionName)?.researched ?? []).includes("Market-TA.II");
      /** @type {ProductData[]} */
      const productEntries = (state.products ?? []).filter((/** @type {ProductData} */ product) =>
        product.developmentProgress >= 100 && !researchedTa2(product.division));
      /** @type {MaterialData[]} */
      const materialEntries = flags["fixed-material-prices"] ? [] : (state.materials ?? []).filter((/** @type {MaterialData} */ material) =>
        material.productionAmount > 0);
      const pricing = priceOrders(productEntries, materialEntries, priceMemory);
      writePrices(ns, pricing.lines);
      ns.write(PRICE_MEMORY_FILE, JSON.stringify(Object.fromEntries(priceMemory)), "w");
      if (pricing.productOrders.length) await report(ns, log, "sell-product", pricing.productOrders, false);
      if (pricing.materialOrders.length) await report(ns, log, "sell-material", pricing.materialOrders, false);
      if (pricing.productOrders.length || pricing.materialOrders.length) {
        lastPriceChange = Date.now();
        acted = true;
      }
    }

    const divisionData = state.divisions.find((/** @type {{name: string}} */ entry) => entry.name === division);
    if (!divisionData) { waiting(`no division ${division} yet`); if (acted) lastStateTime = state.time; continue; }
    if (!divisionData.cities.includes(mainCity)) { waiting(`${division} has no office in ${mainCity} yet`); if (acted) lastStateTime = state.time; continue; }
    lastWaiting = "";
    // Development progress and rating are the same in every city: decide on the main city's entries.
    /** @type {ProductData[]} */
    const products = (state.products ?? []).filter((/** @type {ProductData} */ product) => product.division === division && product.city === mainCity);
    let funds = state.corporation.funds;

    // Sell orders for finished products (pricing above takes over from "MP"), and Market-TA.II once researched.
    const finished = products.filter((product) => product.developmentProgress >= 100);
    const unsold = finished.filter((product) => !product.desiredSellAmount);
    if (unsold.length) {
      await report(ns, log, "sell-product", unsold.map((product) => [division, mainCity, product.name, "MAX", "MP", true]));
      acted = true;
    }
    const divisionResearch = (state.researchStatus ?? []).find((/** @type {{division: string}} */ entry) => entry.division === division)?.researched ?? [];
    if (divisionResearch.includes("Market-TA.II")) {
      const withoutTa2 = finished.filter((product) => !marketTa2Products.has(product.name));
      if (withoutTa2.length) {
        await report(ns, log, "set-product-market-ta2", withoutTa2.map((product) => [division, product.name, true]));
        for (const product of withoutTa2) marketTa2Products.add(product.name);
        acted = true;
      }
    }

    // Keep one product in development.
    if (!products.some((product) => product.developmentProgress < 100)) {
      if (products.length >= divisionData.maxProducts) {
        const worst = finished.reduce((lowest, product) => (product.rating < lowest.rating ? product : lowest));
        await report(ns, log, "discontinue-product", [[division, worst.name]]);
        marketTa2Products.delete(worst.name);
      }
      const investment = Math.max(0, funds * Number(flags["invest-fraction"]));
      const name = nextProductName(division, products);
      await report(ns, log, "make-product", [[division, mainCity, name, investment, investment]]);
      funds -= 2 * investment;
      acted = true;
    }

    // Wilson Analytics first, then Advert.
    if (!flags["hold-upgrades"] && funds > 0) {
      const wilsonCost = WILSON_BASE_PRICE * WILSON_PRICE_MULT ** (state.upgrades?.[WILSON] ?? 0);
      if (wilsonCost <= funds * Number(flags["wilson-fraction"])) {
        await report(ns, log, "level-upgrade", [[WILSON]]);
        funds -= wilsonCost;
        acted = true;
      }
      const adverts = [];
      let advertLevel = divisionData.numAdVerts;
      while (adverts.length < MAX_ADVERTS_PER_ROUND) {
        const cost = ADVERT_BASE_PRICE * ADVERT_PRICE_MULT ** advertLevel;
        if (cost > funds * Number(flags["advert-fraction"])) break;
        adverts.push([division]);
        funds -= cost;
        advertLevel++;
      }
      if (adverts.length) {
        await report(ns, log, "hire-advert", adverts);
        acted = true;
      }
    }
    if (acted) lastStateTime = state.time;
  }
}

/**
 * New sell orders for every product and material whose price is "MP" or "MP+x" (lib/corp-pricing.js).
 * @param {ProductData[]} products @param {MaterialData[]} materials @param {Map<string, {calibrated?: boolean}>} memory
 */
function priceOrders(products, materials, memory) {
  /** @type {unknown[][]} */
  const productOrders = [], materialOrders = [];
  /** @type {string[]} */
  const lines = [];
  const items = [
    ...products.map((product) => ({ kind: /** @type {const} */ ("product"), entry: product, marketPrice: product.productionCost, supply: product.productionAmount,
      startDelta: bestOlderPrice(products, product) })),
    // Exports leave before the sale: for materials, what was sold is the best guess of the supply.
    ...materials.map((material) => ({ kind: /** @type {const} */ ("material"), entry: material, marketPrice: material.marketPrice, supply: material.actualSellAmount,
      startDelta: undefined })),
  ];
  for (const { kind, entry, marketPrice, supply, startDelta } of items) {
    if (String(entry.desiredSellAmount) !== "MAX" || marketPrice <= 0) continue;
    const delta = parsePriceDelta(entry.desiredSellPrice);
    if (delta === null) continue;
    const key = `${entry.division}/${entry.city}/${entry.name}`;
    if (!memory.has(key)) memory.set(key, {});
    const next = nextPriceDelta({ marketPrice, delta, sold: entry.actualSellAmount, supply, leftover: entry.stored, startDelta, kind },
      /** @type {{calibrated?: boolean}} */ (memory.get(key)));
    const price = formatPrice(next.delta);
    lines.push(`${key.padEnd(34)} ${price.padEnd(14)} = ${((marketPrice + next.delta) / marketPrice).toFixed(3)} x MP`
      + `  sold ${entry.actualSellAmount.toFixed(1)}/s, left ${Math.round(entry.stored)}  (${next.reason})`);
    if (price === formatPrice(delta)) continue;
    if (kind === "product") productOrders.push([entry.division, entry.city, entry.name, "MAX", price, false]);
    else materialOrders.push([entry.division, entry.city, entry.name, "MAX", price]);
  }
  return { productOrders, materialOrders, lines };
}

/**
 * The highest price above MP among the products of the same division and city with a lower rating: a new product
 * (higher rating) sells at least as well there, so it can start at that price instead of probing up from MP.
 * @param {ProductData[]} products @param {ProductData} product
 */
function bestOlderPrice(products, product) {
  const older = products.filter((other) => other.division === product.division && other.city === product.city
    && other.name !== product.name && other.rating <= product.rating);
  return Math.max(0, ...older.map((other) => parsePriceDelta(other.desiredSellPrice) ?? 0));
}

/** @param {NS} ns @param {string[]} lines */
function writePrices(ns, lines) {
  if (lines.length) ns.write(PRICES_FILE, `${formatTime()}  new prices (item, price, sales, reason):\n${lines.join("\n")}\n`, "w");
}

/** @param {NS} ns */
function readState(ns) {
  return readJson(ns, STATE_FILE);
}

/** @param {NS} ns @param {string} file */
function readJson(ns, file) {
  try {
    return JSON.parse(ns.read(file));
  } catch {
    return null;
  }
}

/**
 * tools/corp-office.js request: grow offices to a size (or what a budget buys), hire up to it and split the jobs.
 * @param {NS} ns @param {(event: string, details: string) => void} log @param {any} state
 * @param {{division: string, city: string, size: number, budgetFraction: number, jobs: Record<string, number> | null,
 *   dryRun?: boolean}} request
 */
async function growOffices(ns, log, state, request) {
  /** @type {{division: string, city: CityName, size: number, numEmployees: number, employeeJobs: Record<string, number>}[]} */
  const offices = state.offices.filter((/** @type {{division: string, city: string}} */ office) =>
    office.division === request.division && (request.city === "all" || office.city === request.city));
  if (!offices.length) { log("failed", `office: no office of ${request.division} in ${request.city}`); return; }
  const budgetPerOffice = state.corporation.funds * request.budgetFraction / offices.length;
  const upgrades = [], hires = [], assignments = [], lines = [];
  let cost = 0;
  for (const office of offices) {
    const size = request.size ? Math.max(office.size, request.size) : largestAffordableSize(office.size, budgetPerOffice);
    const currentWeights = Object.fromEntries(JOBS.map((job) => [job, office.employeeJobs[job] ?? 0]));
    const weights = request.jobs ?? (JOBS.some((job) => currentWeights[job] > 0)
      ? currentWeights : { Operations: 1, Engineer: 1, Business: 1, Management: 1 });
    const split = jobSplit(size, weights);
    const upgradeCost = size > office.size ? officeUpgradeCost(office.size, size - office.size) : 0;
    cost += upgradeCost;
    if (size > office.size) upgrades.push([request.division, office.city, size - office.size]);
    for (let hire = office.numEmployees; hire < size; hire++) hires.push([request.division, office.city, "Unassigned"]);
    // Free everyone first, then assign (each assignment needs enough unassigned employees). Interns first: below
    // 1/9 interns energy and morale decay, so if hiring fell short, a regular job comes up short instead.
    for (const job of ["Intern", ...JOBS]) assignments.push([request.division, office.city, job, 0]);
    for (const job of ["Intern", ...JOBS]) if (split[job]) assignments.push([request.division, office.city, job, split[job]]);
    lines.push(`${office.city}: ${office.size} -> ${size} ($${(upgradeCost / 1e9).toFixed(1)}b), ${JSON.stringify(split)}`);
  }
  if (request.dryRun) {
    log("plan", `${request.division} offices for $${(cost / 1e9).toFixed(1)}b:`);
    for (const line of lines) log("plan", `  ${line}`);
    return;
  }
  if (upgrades.length) await report(ns, log, "upgrade-office-size", upgrades);
  if (hires.length) await report(ns, log, "hire-employee", hires, false);
  await report(ns, log, "set-job-assignment", assignments, false);
  log("office", `${request.division}: $${(cost / 1e9).toFixed(1)}b, ${hires.length} hired; ${lines.join("; ")}`);
}

/**
 * tools/corp-upgrades.js request: corporation upgrades for a share of funds, cheapest next level first.
 * @param {NS} ns @param {(event: string, details: string) => void} log @param {any} state
 * @param {{names: string[], budgetFraction: number, dryRun?: boolean}} request
 */
async function buyUpgrades(ns, log, state, request) {
  const budget = state.corporation.funds * request.budgetFraction;
  const plan = planUpgrades(state.upgrades ?? {}, request.names, budget);
  const summary = Object.entries(plan.levels).map(([name, levels]) => `${name} +${levels} (to ${(state.upgrades?.[name] ?? 0) + levels})`).join(", ");
  if (request.dryRun) { log("plan", `upgrades for ${(plan.cost / 1e9).toFixed(1)}b of ${(budget / 1e9).toFixed(1)}b: ${summary || "nothing affordable"}`); return; }
  const calls = Object.entries(plan.levels).flatMap(([name, levels]) => Array.from({ length: levels }, () => [name]));
  if (calls.length) await report(ns, log, "level-upgrade", calls, false);
  log("upgrades", `${(plan.cost / 1e9).toFixed(1)}b of ${(budget / 1e9).toFixed(1)}b: ${summary || "nothing affordable"}`);
}

/**
 * tools/corp-boosts.js request: warehouse levels + optimal boost materials for one division (lib/corp-boosts.js).
 * @param {NS} ns @param {(event: string, details: string) => void} log @param {any} state
 * @param {{division: string, budgetFraction: number, fill: number, dryRun?: boolean}} request
 */
async function buyBoosts(ns, log, state, request) {
  const division = state.divisions.find((/** @type {{name: string}} */ entry) => entry.name === request.division);
  if (!division) { log("failed", `boosts: no division ${request.division}`); return; }
  const data = await runReader(ns, "boost-data", [JSON.stringify([division.industry])]);
  const cities = state.warehouses.filter((/** @type {{division: string}} */ warehouse) => warehouse.division === division.name)
    .map((/** @type {{city: string, level: number, size: number, sizeUsed: number}} */ warehouse) => {
      const materials = state.materials.filter((/** @type {MaterialData} */ material) => material.division === division.name && material.city === warehouse.city
        && /** @type {readonly string[]} */ (BOOST_MATERIALS).includes(material.name));
      return {
        city: warehouse.city, level: warehouse.level, size: warehouse.size, sizeUsed: warehouse.sizeUsed,
        stored: Object.fromEntries(materials.map((/** @type {MaterialData} */ material) => [material.name, material.stored])),
        prices: Object.fromEntries(materials.map((/** @type {MaterialData} */ material) => [material.name, material.marketPrice])),
      };
    });
  if (!cities.length) { log("failed", `boosts: ${division.name} has no warehouses`); return; }
  const budget = state.corporation.funds * request.budgetFraction;
  const plan = planBoosts(cities, data.factors[division.industry], data.sizes, data.baseCosts, budget, request.fill);
  if (request.dryRun) {
    log("plan", `${division.name}: warehouses to level ${plan.targetLevel}, ~${(plan.cost / 1e9).toFixed(1)}b of ${(budget / 1e9).toFixed(1)}b budget`);
    for (const city of plan.cities) log("plan", `  ${city.city}: +${city.levels} levels (${(city.upgradeCost / 1e9).toFixed(1)}b), size ${Math.round(city.newSize)}, `
      + `buy ${JSON.stringify(city.purchases)} (${(city.purchaseCost / 1e9).toFixed(1)}b)`);
    return;
  }
  const upgrades = plan.cities.filter((city) => city.levels > 0).map((city) => [division.name, city.city, city.levels]);
  if (upgrades.length) await report(ns, log, "upgrade-warehouse", upgrades);
  const purchases = plan.cities.flatMap((city) => Object.entries(city.purchases).map(([material, amount]) => [division.name, city.city, material, amount]));
  if (purchases.length) await report(ns, log, "bulk-purchase", purchases);
  log("boosts", `${division.name}: warehouses to level ${plan.targetLevel}, boosts for ${Math.round(request.fill * 100)}% of the space, `
    + `~${(plan.cost / 1e9).toFixed(1)}b of ${(budget / 1e9).toFixed(1)}b budget`);
}

/** "<division>-<n>" with n one above the highest number in use. @param {string} division @param {{name: string}[]} products */
function nextProductName(division, products) {
  const numbers = products.map((product) => Number(product.name.match(/-(\d+)$/)?.[1] ?? 0));
  return `${division}-${Math.max(0, ...numbers) + 1}`;
}

/**
 * Runs an action worker and logs its outcome: every call, or (logEachCall false, for the frequent price changes)
 * only the count and failures.
 * @param {NS} ns @param {(event: string, details: string) => void} log @param {string} action @param {unknown[][]} calls
 * @param {boolean} [logEachCall]
 */
async function report(ns, log, action, calls, logEachCall = true) {
  const results = await runAction(ns, action, calls);
  const failures = results.filter((result) => !result.ok);
  if (logEachCall || failures.length) {
    const first = JSON.stringify(results[0]?.args ?? []);
    log(action, `${results.length - failures.length}/${results.length} ok, e.g. ${first}`);
  }
  for (const failure of failures) log("failed", `${action} ${JSON.stringify(failure.args)}: ${failure.error}`);
}
