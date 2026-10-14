import { appendLog, formatTime } from "lib/log.js";
import { runAction } from "lib/corp-scripts.js";
import { formatPrice, nextPriceDelta, parsePriceDelta } from "lib/corp-pricing.js";

const STATE_FILE = "data/corp-state.txt";
const LOG_FILE = "data/corp-manager.txt";
const PRICES_FILE = "data/corp-prices.txt";
const INTERVAL_MS = 5_000;
const WILSON = "Wilson Analytics";
// Upgrade cost = base price x price multiplier ^ level (game code).
const WILSON_BASE_PRICE = 4e9, WILSON_PRICE_MULT = 2;
const ADVERT_BASE_PRICE = 1e9, ADVERT_PRICE_MULT = 1.06;
const MAX_ADVERTS_PER_ROUND = 20;

/**
 * @typedef {{division: string, city: CityName, name: string, developmentProgress: number, rating: number,
 *   desiredSellAmount: string | number, desiredSellPrice: string | number, stored: number, productionAmount: number,
 *   actualSellAmount: number, productionCost: number}} ProductData one product in one city (workers/corp-read-products.js)
 * @typedef {{division: string, city: CityName, name: string, stored: number, productionAmount: number,
 *   actualSellAmount: number, marketPrice: number, desiredSellAmount?: string | number,
 *   desiredSellPrice?: string | number}} MaterialData (workers/corp-read-materials.js)
 */

// corp-manager.js (home): runs the corporation's routine work, the round 3+ loop of the corporation guide:
// - Products of --division: always one in development in --city; when all product slots are full, the product with
//   the lowest rating is discontinued first. Design and marketing investment: --invest-fraction of funds each.
//   Finished products get a sell order (MAX) in all cities.
// - Prices like Market-TA.II for every product and every produced material that sells "MAX" at "MP" or "MP+x"
//   (lib/corp-pricing.js), without the 70k RP research. Prices set by hand are left alone. Once Market-TA.II is
//   researched, products use the game's own. --fixed-material-prices leaves materials alone.
// - Wilson Analytics when it costs <= --wilson-fraction of funds, then Advert levels for --division while each costs
//   <= --advert-fraction of funds (Wilson first: it multiplies every later Advert).
// Decisions use data/corp-state.txt (services/corp-status.js, every 20 s); after acting it waits for a newer state.
// Every action is its own 20 GB worker (workers/corp-do-*.js). Log: data/corp-manager.txt; current prices:
// data/corp-prices.txt.
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
  ]);
  const division = String(flags.division), mainCity = /** @type {CityName} */ (String(flags.city));
  /** Products that already have Market-TA.II turned on (not visible in the product data). */
  const marketTa2Products = new Set();
  /** @type {Map<string, {calibrated?: boolean}>} pricing memory per item and city */
  const priceMemory = new Map();
  let lastStateTime = 0, lastPriceChange = 0, lastWaiting = "";
  const log = (/** @type {string} */ event, /** @type {string} */ details) => appendLog(ns, LOG_FILE, event, details);
  const waiting = (/** @type {string} */ reason) => {
    if (reason !== lastWaiting) log("waiting", reason);
    lastWaiting = reason;
  };
  log("start", `division ${division}, main city ${mainCity}`);

  while (true) {
    await ns.sleep(INTERVAL_MS);
    const state = readState(ns);
    if (!state || state.time <= lastStateTime) continue;
    let acted = false;

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
    ...products.map((product) => ({ kind: "product", entry: product, marketPrice: product.productionCost, supply: product.productionAmount })),
    // Exports leave before the sale: for materials, what was sold is the best guess of the supply.
    ...materials.map((material) => ({ kind: "material", entry: material, marketPrice: material.marketPrice, supply: material.actualSellAmount })),
  ];
  for (const { kind, entry, marketPrice, supply } of items) {
    if (String(entry.desiredSellAmount) !== "MAX" || marketPrice <= 0) continue;
    const delta = parsePriceDelta(entry.desiredSellPrice);
    if (delta === null) continue;
    const key = `${entry.division}/${entry.city}/${entry.name}`;
    if (!memory.has(key)) memory.set(key, {});
    const next = nextPriceDelta({ marketPrice, delta, sold: entry.actualSellAmount, supply, leftover: entry.stored },
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

/** @param {NS} ns @param {string[]} lines */
function writePrices(ns, lines) {
  if (lines.length) ns.write(PRICES_FILE, `${formatTime()}  new prices (item, price, sales, reason):\n${lines.join("\n")}\n`, "w");
}

/** @param {NS} ns */
function readState(ns) {
  try {
    return JSON.parse(ns.read(STATE_FILE));
  } catch {
    return null;
  }
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
