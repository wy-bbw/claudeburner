import { appendLog } from "lib/log.js";
import { runAction, runReader } from "lib/corp-scripts.js";
import { BOOST_MATERIALS, bestBoostPurchase, bestStorageUpgrades, boostSpaceFor, warehouseUpgradeCost } from "lib/corp-boosts.js";
import { upgradeCost } from "lib/corp-upgrades.js";
import { JOBS, jobSplit, largestAffordableSize, officeUpgradeCost } from "lib/corp-offices.js";
import { bestGrowthPlan, bestRevenuePlan } from "lib/corp-growth-plan.js";
import { potentialSales } from "lib/corp-market.js";

// corp-startup.js (home): the startup recipe of the memory note "corp-startup-recipe" as steps, one phase per run:
//   --phase startup        expand to six cities, sell orders, Advert 3, offices to 4 employees all on R&D, then all cash but
//                          --reserve into the warehouse level / Smart Storage / Smart Factories combination with the highest
//                          production after the fill (lib/corp-boosts.js bestStorageUpgrades), then the boost fill as BUY ORDERS
//                          (debt), then wait for 75 research points, then jobs Operations 1 / Engineer 1 / Business 1 / Management 1
//   --phase after-round-1  after accepting round 1 (the user's approach, 2026-10-23): unlocks Market Research - Demand +
//                          Market Data - Competition (our TA.II prices), Smart Supply, Export; a Chemical division (--chemical
//                          <name>) in all six cities, offices 3 -> 6 (Ops 1 / Eng 2 / Business 1 / Mgmt 1 / R&D 1), Smart Supply on
//                          in both divisions with imports on "leftovers", exports Plants Agriculture -> Chemical and Chemicals
//                          Chemical -> Agriculture ((IPROD+IINV/10)*(-1) each = consumption minus a tenth of the importer's stock, every city; an existing export with another amount is replaced), Chemicals sold MAX at MP, Chemical warehouses +3
//                          levels (to 4); Agriculture offices 4 -> 7 with the 3 new employees on R&D; fill both divisions; wait
//                          for 700 research points in Agriculture, then its R&D staff move to Operations/Business (3/1/2/1);
//                          Chemical keeps 1/2/1/1/1. Asks for the Chemical division's
//                          name unless --chemical is given or one exists. Then start services/corp/manager.js --upkeep-and-prices-only.
//   --phase product-division  a Tobacco division (--product <name>, asked for unless given or one exists; --product-industry
//                          for another industry) in all six cities with Smart Supply ("leftovers"), Plants exported to it from
//                          Agriculture ((IPROD+IINV/10)*(-1)), Aevum (the development office) to 20 employees with the
//                          fastest-development split (~5% Ops / 47% Eng / 47% Mgmt, interns from 9), the first product
//                          developed there (--product-investment of the cash each for design and marketing), warehouses +2
//                          levels (to 3), then the other
//                          offices as large as the remaining cash (minus --reserve) allows but not larger than Aevum, half on
//                          R&D (the manager's maintain split). No fill: run --only fill --division <name> --fill 0.8 when wanted. Afterwards the corp
//                          manager runs the products (sell, next ones).
//   --phase after-round-1-fixed  the earlier hand plan: Wilson 4 + the upgrade targets, warehouses level 10 (2k storage with
//                          Smart Storage 10), 6 employees (1/1/2/1/1/0), Advert 16, fill again
//   --phase after-round-1-optimized  the budget-driven variant (worse in its one test, ~$2t round-2 offer): Wilson Analytics with --wilson-fraction of the cash, then Advert
//                          with --advert-fraction (Wilson first: each Advert uses the Wilson level at purchase), the rest but
//                          --reserve into office size / warehouse level / Smart Storage / Smart Factories / ABC SalesBots, the
//                          combination with the most revenue under Market-TA.II-style prices (our replacement in the corp
//                          manager, lib/corp-market.js): production x MP + markup limit x sqrt(potential sales x production),
//                          lib/corp-growth-plan.js bestRevenuePlan; jobs split 1/1/2/1/1 Ops/Eng/Business/Mgmt/R&D, interns
//                          from 9. Without the Demand + Competition unlocks only by production (bestGrowthPlan). Then fill
//                          the bigger warehouses again (buy orders, debt). Run the corp manager afterwards for the prices.
// Dry run by default: prints each step with its cash cost (--go does it). Create the corporation and the Agriculture
// division by hand first (no worker for that). The fill is bought on debt with buy orders, not bulkPurchase (which refuses
// a call above the current funds): an order of amount/10 per second is paid in the next PURCHASE state without a funds check;
// the script waits until the stock is there, then sets the orders back to 0 (if it is killed meanwhile, clear the orders by
// hand). Under bonus time (several cycles per tick) an order may buy more than planned, limited by the free warehouse space.
// No Smart Supply unlock: run services/corp/supply.js alongside (buy orders for the inputs, same logic).
// All other steps need cash and stop the run when it is missing, so the upgrades come before the fill. Not the corp manager: start nothing else meanwhile.
// --only <step> runs every entry of that step (unlocks, create-division, expand, smart-supply, exports, make-product, sell-orders, adverts,
// storage, growth, warehouses, research, upgrades, staff, fill);
// "research" only waits for the points, the staff step before it puts everyone on R&D.
// Needs the corporation workers (workers/corp/read-*.js, workers/corp/do-*.js) and ~25 GB free on home, one at a time.
// Log: data/corp-startup.txt.
// Steps marked for the Chemical division act on --chemical (default: the existing Chemical division, else "chemicals");
// the others on --division (default: the only division, else the Agriculture one).
// Usage: run services/corp-startup.js --phase startup [--division <name>] [--chemical <name>] [--product <name>] [--product-industry Tobacco] [--product-investment 0.01] [--fill 0.83] [--research-points 75] [--reserve 1e9] [--wilson-fraction 0.15] [--advert-fraction 0.05] [--go]

const LOG_FILE = "data/corp-startup.txt";
const ALL_CITIES = /** @type {CityName[]} */ (["Sector-12", "Aevum", "Chongqing", "New Tokyo", "Ishima", "Volhaven"]);
const RESEARCH_JOB = "Research & Development";
const RESEARCH_POLL_MS = 15_000;
const SMART_STORAGE = "Smart Storage", SMART_FACTORIES = "Smart Factories";
const SECONDS_PER_MARKET_CYCLE = 10;
const FILL_POLL_LIMIT = 12;
const ADVERT_BASE_PRICE = 1e9, ADVERT_PRICE_MULT = 1.06;
const WILSON = "Wilson Analytics", SALES_BOTS = "ABC SalesBots";
const EXPORT_AMOUNT = "(IPROD+IINV/10)*(-1)";
// Job weights (lib/corp-offices.js jobSplit, interns from 9 employees): the development office gets the fastest-development
// split (memory note product-development-split), the others half R&D and the rest even (the manager's maintain split).
const DEVELOPMENT_WEIGHTS = { Operations: 5, Engineer: 47, Management: 47 };
const SUPPORT_WEIGHTS = { Operations: 1, Engineer: 1, Business: 1, Management: 1, [RESEARCH_JOB]: 4 };

/** @typedef {Record<string, number>} Counts */
/** Per phase: the steps in order. @type {Record<string, {step: string, [key: string]: any}[]>} */
const PHASES = {
  startup: [
    { step: "expand" },
    { step: "sell-orders" },
    { step: "adverts", total: 3 },
    { step: "staff", size: 4, jobs: { [RESEARCH_JOB]: 4 } },
    { step: "storage" },
    { step: "fill" },
    { step: "research" },
    { step: "staff", size: 4, jobs: { Operations: 1, Engineer: 1, Business: 1, Management: 1 } },
  ],
  "after-round-1": [
    { step: "unlocks", names: ["Market Research - Demand", "Market Data - Competition", "Smart Supply", "Export"] },
    { step: "create-division", division: "chemical", industry: "Chemical" },
    { step: "expand", division: "chemical" },
    { step: "staff", division: "chemical", size: 6, jobs: { Operations: 1, Engineer: 2, Business: 1, Management: 1, [RESEARCH_JOB]: 1 } },
    { step: "staff", size: 7, jobs: { Operations: 1, Engineer: 1, Business: 1, Management: 1, [RESEARCH_JOB]: 3 } },
    { step: "smart-supply" },
    { step: "smart-supply", division: "chemical" },
    // The guide's amount: the importer's consumption per second (-IPROD) minus a tenth of what it already holds (IINV/10).
    { step: "exports", from: "agriculture", to: "chemical", material: "Plants", amount: EXPORT_AMOUNT },
    { step: "exports", from: "chemical", to: "agriculture", material: "Chemicals", amount: EXPORT_AMOUNT },
    { step: "sell-orders", division: "chemical" },
    { step: "warehouses", division: "chemical", levels: 3 },
    { step: "fill" },
    { step: "fill", division: "chemical" },
    { step: "research", points: 700 },
    // Agriculture's R&D staff move to sales (Operations + Business) at 700 research points; Chemical keeps its R&D person.
    { step: "staff", size: 7, jobs: { Operations: 3, Engineer: 1, Business: 2, Management: 1 } },
  ],
  "product-division": [
    { step: "create-division", division: "product" },
    { step: "expand", division: "product" },
    { step: "smart-supply", division: "product" },
    { step: "exports", from: "agriculture", to: "product", material: "Plants", amount: EXPORT_AMOUNT },
    { step: "staff", division: "product", city: "Aevum", size: 20, weights: DEVELOPMENT_WEIGHTS },
    { step: "make-product", division: "product", city: "Aevum" },
    { step: "warehouses", division: "product", levels: 2 },
    { step: "staff", division: "product", exceptCity: "Aevum", size: "affordable", maxSize: 20, weights: SUPPORT_WEIGHTS },
    // No fill here: spend the rest of the cash first, then fill separately (--only fill --division <name> --fill 0.8, on debt).
  ],
  "after-round-1-fixed": [
    { step: "upgrades", levels: {
      "Wilson Analytics": 4, "Neural Accelerators": 2, "Project Insight": 1, [SMART_STORAGE]: 10, "Speech Processor Implants": 5,
      "ABC SalesBots": 11, "Smart Factories": 10, "Nuoptimal Nootropic Injector Implants": 2, "FocusWires": 5 } },
    { step: "warehouses", level: 10 },
    { step: "staff", size: 6, jobs: { Operations: 1, Engineer: 1, Business: 2, Management: 1, [RESEARCH_JOB]: 1 } },
    { step: "adverts", total: 16 },
    { step: "fill" },
  ],
  // Budget-driven variant (2026-10-23): gave only ~$8-11M/s and a ~$2t round-2 offer against ~$3.2t expected from the fixed plan.
  "after-round-1-optimized": [
    { step: "growth", weights: { Operations: 1, Engineer: 1, Business: 2, Management: 1, [RESEARCH_JOB]: 1 } },
    { step: "fill" },
  ],
};

/** @param {number} level @param {number} smartStorage storage of a plain warehouse level (100) times the Smart Storage bonus */
const plannedSize = (level, smartStorage) => 100 * level * (1 + 0.1 * smartStorage);
const billions = (/** @type {number} */ value) => `$${(value / 1e9).toFixed(1)}b`;

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  const flags = ns.flags([["phase", "startup"], ["division", ""], ["chemical", ""], ["product", ""], ["product-industry", "Tobacco"], ["product-investment", 0.01], ["fill", 0.83], ["research-points", 75], ["reserve", 1e9], ["wilson-fraction", 0.15], ["advert-fraction", 0.05], ["go", false], ["only", ""]]);
  const phase = PHASES[String(flags.phase)];
  if (!phase) { ns.tprint(`--phase must be ${Object.keys(PHASES).join(" or ")}`); return; }
  const go = Boolean(flags.go);
  const say = (/** @type {string} */ text) => { ns.tprint(text); appendLog(ns, LOG_FILE, go ? "go" : "plan", text); };

  const corporation = await runReader(ns, "corporation", []);
  const names = /** @type {string[]} */ (corporation.divisions ?? []);
  const infos = names.length ? await runReader(ns, "divisions", [JSON.stringify(names)]) : [];
  const ofIndustry = (/** @type {string} */ industry) => infos.find((/** @type {{industry: string}} */ info) => info.industry === industry)?.name ?? "";
  const divisionName = String(flags.division) || (names.length === 1 ? names[0] : ofIndustry("Agriculture"));
  if (!divisionName || !names.includes(divisionName)) {
    ns.tprint(`division "${divisionName}" not found among ${JSON.stringify(names)}: create the corporation and the Agriculture division by hand, or pass --division`);
    return;
  }
  let chemicalName = String(flags.chemical) || ofIndustry("Chemical");
  if (!chemicalName && phase.some((entry) => entry.division === "chemical")) {
    chemicalName = String(await ns.prompt("Name for the new Chemical division:", { type: "text" })).trim();
    if (!chemicalName) { ns.tprint("no name for the Chemical division: stopped (or pass --chemical <name>)"); return; }
  }
  const productIndustry = String(flags["product-industry"]);
  let productName = String(flags.product) || ofIndustry(productIndustry);
  if (!productName && phase.some((entry) => entry.division === "product")) {
    productName = String(await ns.prompt(`Name for the new ${productIndustry} division:`, { type: "text" })).trim();
    if (!productName) { ns.tprint(`no name for the ${productIndustry} division: stopped (or pass --product <name>)`); return; }
  }
  /** @param {string | undefined} role "chemical", "product" or "agriculture"/undefined */
  const nameOf = (role) => role === "chemical" ? chemicalName : role === "product" ? productName : divisionName;
  say(`${go ? "RUN" : "DRY RUN"} phase ${flags.phase} for ${divisionName}${phase.some((entry) => entry.division === "chemical") ? ` and ${chemicalName}` : ""}${phase.some((entry) => entry.division === "product") ? ` and ${productName}` : ""}; funds ${billions(corporation.funds)}`);

  // What the dry run assumes the earlier steps did (a real run reads the game again before each step), per division.
  const planned = { funds: corporation.funds, smartStorage: -1, levels: /** @type {Map<string, number>} */ (new Map()),
    officeSizes: /** @type {Map<string, number>} */ (new Map()), created: /** @type {Map<string, string>} */ (new Map()), names: { agriculture: divisionName, chemical: chemicalName, product: productName } };
  /** @type {Map<string, {levels: Map<string, number>, officeSizes: Map<string, number>}>} */
  const views = new Map();

  for (const entry of phase) {
    if (flags.only && flags.only !== entry.step) continue;
    const name = nameOf(entry.division);
    if (!views.has(name)) views.set(name, { levels: new Map(), officeSizes: new Map() });
    const view = /** @type {{levels: Map<string, number>, officeSizes: Map<string, number>}} */ (views.get(name));
    planned.levels = view.levels;
    planned.officeSizes = view.officeSizes;
    const snapshot = await readSnapshot(ns, name, entry.industry ?? (entry.division === "product" ? productIndustry : ""), planned);
    if (planned.smartStorage < 0) planned.smartStorage = snapshot.upgrades[SMART_STORAGE] ?? 0;
    const cash = go ? snapshot.corporation.funds : planned.funds;
    /** @type {{lines: string[], cost: number, run: () => Promise<void>}} */
    const step = await planStep(ns, entry, snapshot, planned, flags, say);
    say(`[${entry.step}] ${step.lines.join(" | ") || "nothing to do"}${step.cost ? `  cost ${billions(step.cost)} of ${billions(cash)} cash` : ""}`);
    // Steps that cost nothing (job assignments, the research wait) also run on debt, after the fill.
    if (entry.step !== "fill" && step.cost > 0 && step.cost > cash) {
      say(`[${entry.step}] stopped: needs ${billions(step.cost)}, has ${billions(cash)}`);
      if (go) return;
    }
    planned.funds -= step.cost;
    if (go) await step.run();
  }
  if (go) {
    const offer = await runReader(ns, "investment", []);
    say(`done: wait ~10 cycles, then check the offer (now round ${offer.round}: ${billions(offer.funds)} for ${offer.shares} shares)`);
  } else say("dry run only: pass --go to do it");
}

/**
 * The corporation, the division and its offices/warehouses/upgrades. A division that does not exist yet (dry run, or before
 * its create-division step) is stubbed: after a planned creation as six cities with a 3-employee office and a level-1 warehouse.
 * @param {NS} ns @param {string} division @param {string} industry @param {{created: Map<string, string>, smartStorage: number}} planned
 */
async function readSnapshot(ns, division, industry, planned) {
  const corporation = await runReader(ns, "corporation", []);
  if (!(corporation.divisions ?? []).includes(division)) {
    const upgrades = await runReader(ns, "upgrades", []);
    const created = planned.created.has(division);
    const cities = created ? ALL_CITIES : [];
    const info = { name: division, industry: industry || planned.created.get(division) || "", cities, numAdVerts: 0, researchPoints: 0, awareness: 0, popularity: 0, exists: false };
    const jobs = Object.fromEntries(["Intern", ...JOBS, "Unassigned"].map((job) => [job, 0]));
    const offices = cities.map((city) => ({ division, city, size: 3, numEmployees: 0, employeeJobs: jobs, employeeProductionByJob: { ...jobs, total: 0 } }));
    const size = 100 * (1 + 0.1 * (upgrades[SMART_STORAGE] ?? 0));
    const warehouses = cities.map((city) => ({ division, city, level: 1, size, sizeUsed: 0, smartSupplyEnabled: false }));
    return { corporation, info, offices, warehouses, upgrades };
  }
  const [info] = await runReader(ns, "divisions", [JSON.stringify([division])]);
  const places = info.cities.map((/** @type {string} */ city) => ({ division, city }));
  const offices = places.length ? await runReader(ns, "offices", [JSON.stringify(places)]) : [];
  const warehouses = places.length ? await runReader(ns, "warehouses", [JSON.stringify(places)]) : [];
  const upgrades = await runReader(ns, "upgrades", []);
  return { corporation, info, offices, warehouses, upgrades };
}

/**
 * Plans one step against the snapshot: what it does, what it costs in cash and how to do it.
 * @param {NS} ns @param {{step: string, [key: string]: any}} entry @param {Awaited<ReturnType<typeof readSnapshot>>} snapshot
 * @param {{funds: number, smartStorage: number, levels: Map<string, number>, officeSizes: Map<string, number>, created: Map<string, string>, names: {agriculture: string, chemical: string, product: string}}} planned @param {any} flags @param {(text: string) => void} say
 */
async function planStep(ns, entry, snapshot, planned, flags, say) {
  const { info, offices, warehouses, upgrades } = snapshot;
  const division = info.name;
  const go = Boolean(flags.go);
  /** @type {string[]} */
  const lines = [];
  let cost = 0;
  let run = async () => {};

  switch (entry.step) {
    case "expand": {
      const newCities = ALL_CITIES.filter((city) => !info.cities.includes(city));
      const withWarehouse = new Set(warehouses.map((/** @type {{city: string}} */ warehouse) => warehouse.city));
      const needWarehouse = ALL_CITIES.filter((city) => !withWarehouse.has(city));
      lines.push(`open ${newCities.join(", ") || "no new cities"}; warehouses in ${needWarehouse.join(", ") || "none needed"}`);
      cost = newCities.length * 4e9 + needWarehouse.length * 5e9;
      for (const city of needWarehouse) planned.levels.set(city, 1);
      run = async () => {
        if (newCities.length) await act(ns, say, "expand-city", newCities.map((city) => [division, city]));
        if (needWarehouse.length) await act(ns, say, "purchase-warehouse", needWarehouse.map((city) => [division, city]));
      };
      break;
    }
    case "unlocks": {
      const unlocks = await runReader(ns, "unlocks", [JSON.stringify(entry.names)]);
      const missing = unlocks.filter((/** @type {{owned: boolean}} */ unlock) => !unlock.owned);
      cost = missing.reduce((/** @type {number} */ sum, /** @type {{cost: number}} */ unlock) => sum + unlock.cost, 0);
      lines.push(`unlocks: buy ${missing.map((/** @type {{name: string}} */ unlock) => unlock.name).join(", ") || "none (all owned)"}`);
      run = async () => { if (missing.length) await act(ns, say, "purchase-unlock", missing.map((/** @type {{name: string}} */ unlock) => [unlock.name])); };
      break;
    }
    case "create-division": {
      if (info.exists !== false) { lines.push(`${division} exists (${info.industry})`); break; }
      const industry = entry.industry ?? info.industry;
      const data = await runReader(ns, "industry-data", [JSON.stringify([industry])]);
      cost = data.industries[industry].startingCost ?? 0;
      lines.push(`create ${industry} division "${division}"`);
      planned.created.set(division, industry);
      run = async () => { await act(ns, say, "expand-industry", [[industry, division]]); };
      break;
    }
    case "smart-supply": {
      // Smart Supply on in every city with a warehouse; inputs from other divisions count as stock ("leftovers", not "imports").
      const data = await runReader(ns, "industry-data", [JSON.stringify([info.industry])]);
      const inputs = Object.keys(data.industries[info.industry]?.requiredMaterials ?? {});
      const cities = /** @type {string[]} */ (warehouses.map((/** @type {{city: string}} */ warehouse) => warehouse.city));
      lines.push(`Smart Supply on in ${cities.length} cities, ${inputs.join("/") || "no inputs"} on "leftovers"`);
      run = async () => {
        if (cities.length) await act(ns, say, "set-smart-supply", cities.map((city) => [division, city, true]));
        const options = cities.flatMap((city) => inputs.map((material) => [division, city, material, "leftovers"]));
        if (options.length) await act(ns, say, "set-smart-supply-option", options);
      };
      break;
    }
    case "exports": {
      // From one division to the other in every city where both have a warehouse. The game refuses a second export to the
      // same warehouse: one with the same amount is kept, one with another amount (e.g. -IPROD set by hand) is cancelled first.
      const source = planned.names[/** @type {"agriculture" | "chemical" | "product"} */ (entry.from)], target = planned.names[/** @type {"agriculture" | "chemical" | "product"} */ (entry.to)];
      const corporationNow = await runReader(ns, "corporation", []);
      const exists = (/** @type {string} */ name) => (corporationNow.divisions ?? []).includes(name);
      const citiesOf = async (/** @type {string} */ name) => exists(name)
        ? (await runReader(ns, "warehouses", [JSON.stringify(ALL_CITIES.map((city) => ({ division: name, city })))])).map((/** @type {{city: string}} */ warehouse) => warehouse.city)
        : (planned.created.has(name) ? ALL_CITIES : []);
      const sourceCities = await citiesOf(source), targetCities = await citiesOf(target);
      const both = sourceCities.filter((/** @type {string} */ city) => targetCities.includes(city));
      const rows = exists(source) && both.length ? await runReader(ns, "materials", [JSON.stringify(both.map((/** @type {string} */ city) => ({ division: source, city })))]) : [];
      // The game stores the amount upper-cased without spaces.
      const sanitized = String(entry.amount).replace(/\s+/g, "").toUpperCase();
      const existing = (/** @type {string} */ city) => rows.find((/** @type {{city: string, name: string}} */ row) => row.city === city && row.name === entry.material)
        ?.exports.find((/** @type {{division: string, city: string, amount: string}} */ exported) => exported.division === target && exported.city === city);
      const todo = both.filter((/** @type {string} */ city) => existing(city)?.amount !== sanitized);
      const cancels = todo.filter((/** @type {string} */ city) => existing(city)).map((/** @type {string} */ city) => [source, city, target, city, entry.material]);
      const calls = todo.map((/** @type {string} */ city) => [source, city, target, city, entry.material, entry.amount]);
      lines.push(`${entry.material} ${source} -> ${target} at ${entry.amount} in ${calls.length} cities`
        + `${cancels.length ? ` (replacing ${cancels.length} with another amount)` : ""}${both.length > calls.length ? ` (${both.length - calls.length} already set)` : ""}`);
      run = async () => {
        if (cancels.length) await act(ns, say, "cancel-export-material", cancels);
        if (calls.length) await act(ns, say, "export-material", calls);
      };
      break;
    }
    case "make-product": {
      // The first product, developed in the development office (only that office's employees develop it).
      const products = /** @type {string[]} */ (info.products ?? []);
      if (products.length) { lines.push(`${division} already has products (${products.join(", ")}): left to the corp manager`); break; }
      const investment = Math.max(0, (go ? snapshot.corporation.funds : planned.funds) * Number(flags["product-investment"]));
      const name = `${division}-1`;
      cost = 2 * investment;
      lines.push(`develop ${name} in ${entry.city} (design and marketing ${billions(investment)} each)`);
      run = async () => { await act(ns, say, "make-product", [[division, entry.city, name, investment, investment]]); };
      break;
    }
    case "sell-orders": {
      const data = await runReader(ns, "industry-data", [JSON.stringify([info.industry])]);
      const produced = /** @type {string[]} */ (data.industries[info.industry].producedMaterials);
      lines.push(`${produced.join("/") || "nothing"} on MAX at MP in all six cities (inputs: services/corp/supply.js)`);
      run = async () => {
        const orders = ALL_CITIES.flatMap((city) => produced.map((material) => [division, city, material, "MAX", "MP"]));
        if (orders.length) await act(ns, say, "sell-material", orders);
      };
      break;
    }
    case "adverts": {
      const levels = Math.max(0, entry.total - info.numAdVerts);
      for (let level = info.numAdVerts; level < entry.total; level++) cost += ADVERT_BASE_PRICE * ADVERT_PRICE_MULT ** level;
      lines.push(`Advert ${info.numAdVerts} -> ${Math.max(info.numAdVerts, entry.total)}`);
      run = async () => { if (levels) await act(ns, say, "hire-advert", Array.from({ length: levels }, () => [division])); };
      break;
    }
    case "warehouses": {
      /** @type {unknown[][]} */
      const calls = [];
      for (const city of ALL_CITIES) {
        const warehouse = warehouses.find((/** @type {{city: string}} */ entryWarehouse) => entryWarehouse.city === city);
        const level = warehouse?.level ?? planned.levels.get(city) ?? 1;
        // entry.level: absolute target; entry.levels: that many levels above level 1 (a new division's warehouses).
        const target = entry.level ?? 1 + entry.levels;
        const levels = Math.max(0, target - level);
        if (levels) { calls.push([division, city, levels]); cost += warehouseUpgradeCost(level, levels); }
        planned.levels.set(city, Math.max(level, target));
      }
      lines.push(`warehouses to level ${entry.level ?? 1 + entry.levels} (${calls.length} cities need upgrades)`);
      run = async () => { if (calls.length) await act(ns, say, "upgrade-warehouse", calls); };
      break;
    }
    case "storage": {
      // All cash but the reserve into warehouse levels (same in every city), Smart Storage and Smart Factories, the
      // combination with the highest production once the fill (on debt) has filled the bigger warehouses.
      const data = await runReader(ns, "industry-data", [JSON.stringify([info.industry])]);
      const cash = (go ? snapshot.corporation.funds : planned.funds) - Number(flags.reserve);
      const levels = ALL_CITIES.map((city) => warehouses.find((/** @type {{city: string}} */ entryWarehouse) => entryWarehouse.city === city)?.level
        ?? planned.levels.get(city) ?? 1);
      const currentStorage = upgrades[SMART_STORAGE] ?? 0, currentFactories = upgrades[SMART_FACTORIES] ?? 0;
      const plan = bestStorageUpgrades({ levels, smartStorage: currentStorage, smartFactories: currentFactories },
        Math.max(0, cash), Number(flags.fill), data.industries[info.industry].factors, data.sizes);
      cost = plan.cost;
      lines.push(`warehouses level ${Math.max(...levels)} -> ${plan.level}, ${SMART_STORAGE} ${currentStorage} -> ${plan.smartStorage}, `
        + `${SMART_FACTORIES} ${currentFactories} -> ${plan.smartFactories}: ${Math.round(plan.size)} storage, production x${(plan.production / plan.baseline).toFixed(2)} after the fill`);
      /** @type {unknown[][]} */
      const upgradeCalls = [];
      for (let level = currentStorage; level < plan.smartStorage; level++) upgradeCalls.push([SMART_STORAGE]);
      for (let level = currentFactories; level < plan.smartFactories; level++) upgradeCalls.push([SMART_FACTORIES]);
      const warehouseCalls = ALL_CITIES.map((city, index) => [division, city, plan.level - levels[index]]).filter((call) => Number(call[2]) > 0);
      ALL_CITIES.forEach((city) => planned.levels.set(city, plan.level));
      planned.smartStorage = plan.smartStorage;
      run = async () => {
        if (upgradeCalls.length) await act(ns, say, "level-upgrade", upgradeCalls);
        if (warehouseCalls.length) await act(ns, say, "upgrade-warehouse", warehouseCalls);
      };
      break;
    }
    case "growth": {
      const data = await runReader(ns, "industry-data", [JSON.stringify([info.industry])]);
      const industry = data.industries[info.industry];
      const cash = Math.max(0, (go ? snapshot.corporation.funds : planned.funds) - Number(flags.reserve));
      // Wilson first, then Advert, each level by level within its share of the cash.
      const wilsonFrom = upgrades[WILSON] ?? 0;
      let wilson = wilsonFrom, wilsonCost = 0;
      while (wilsonCost + upgradeCost(WILSON, wilson) <= cash * Number(flags["wilson-fraction"])) wilsonCost += upgradeCost(WILSON, wilson++);
      let adverts = info.numAdVerts, advertCost = 0;
      const advertPrice = (/** @type {number} */ level) => ADVERT_BASE_PRICE * ADVERT_PRICE_MULT ** level;
      while (advertCost + advertPrice(adverts) <= cash * Number(flags["advert-fraction"])) advertCost += advertPrice(adverts++);
      lines.push(`${WILSON} ${wilsonFrom} -> ${wilson} (${billions(wilsonCost)}), Advert ${info.numAdVerts} -> ${adverts} (${billions(advertCost)})`);

      // The rest: office size, warehouse level, Smart Storage, Smart Factories (and SalesBots) for the most revenue.
      const budget = Math.max(0, cash - wilsonCost - advertCost);
      const levels = ALL_CITIES.map((city) => warehouses.find((/** @type {{city: string}} */ entryWarehouse) => entryWarehouse.city === city)?.level ?? planned.levels.get(city) ?? 1);
      const officeSizes = ALL_CITIES.map((city) => offices.find((/** @type {{city: string}} */ office) => office.city === city)?.size ?? 3);
      const employees = offices.reduce((/** @type {number} */ sum, /** @type {{numEmployees: number}} */ office) => sum + office.numEmployees, 0);
      const employeeProduction = offices.reduce((/** @type {number} */ sum, /** @type {{employeeProductionByJob: {total: number}}} */ office) => sum + office.employeeProductionByJob.total, 0) / Math.max(1, employees);
      const weights = /** @type {Counts} */ (entry.weights);
      const current = { levels, officeSizes, smartStorage: upgrades[SMART_STORAGE] ?? 0, smartFactories: upgrades[SMART_FACTORIES] ?? 0, salesBots: upgrades[SALES_BOTS] ?? 0 };
      const places = info.cities.map((/** @type {string} */ city) => ({ division, city }));
      const materials = await runReader(ns, "materials", [JSON.stringify(places)]);
      let missingMarketData = false;
      const cities = offices.map((/** @type {any} */ office) => ({
        operations: office.employeeProductionByJob.Operations, engineers: office.employeeProductionByJob.Engineer,
        management: office.employeeProductionByJob.Management, business: office.employeeProductionByJob.Business,
        items: /** @type {string[]} */ (industry.producedMaterials).map((name) => {
          const row = materials.find((/** @type {{city: string, name: string}} */ entryRow) => entryRow.city === office.city && entryRow.name === name);
          const quality = row?.quality ?? 0;
          const potential = row ? potentialSales({ kind: "material", marketPrice: row.marketPrice, delta: 0, sold: 0, supply: 0, leftover: 0, quality,
            demand: row.demand, competition: row.competition, businessProduction: office.employeeProductionByJob.Business,
            salesBotsLevel: current.salesBots, awareness: info.awareness, popularity: info.popularity, advertisingFactor: industry.advertisingFactor }) : 0;
          if (potential === null) missingMarketData = true;
          return { production: Math.max(0, row?.productionAmount ?? 0), marketPrice: row?.marketPrice ?? 0,
            markupLimit: quality / (data.baseMarkups?.[name] || 1), potential: potential ?? 0 };
        }),
      }));
      /** @type {{level: number, smartStorage: number, smartFactories: number, officeSize: number, salesBots: number, cost: number}} */
      let plan;
      if (missingMarketData) {
        const production = bestGrowthPlan(current, budget, Number(flags.fill), industry.factors, data.sizes, weights, employeeProduction);
        plan = { ...production, salesBots: current.salesBots };
        lines.push(`no Demand/Competition data (Market Research - Demand + Market Data - Competition unlocks): planned by production only, x${(production.production / production.baseline).toFixed(2)}`);
      } else {
        const revenue = bestRevenuePlan(current, budget, Number(flags.fill), industry.factors, data.sizes, weights, employeeProduction, cities);
        plan = revenue;
        lines.push(`revenue with TA.II prices $${ns.format.number(revenue.baselineRevenue)}/s -> $${ns.format.number(revenue.revenue)}/s (warehouses and upgrades x${revenue.machinery.toFixed(2)} production)`);
      }
      cost = wilsonCost + advertCost + plan.cost;
      const jobs = jobSplit(plan.officeSize, weights);
      lines.push(`offices ${Math.max(...officeSizes)} -> ${plan.officeSize} (jobs ${JSON.stringify(jobs)}), warehouses level ${Math.max(...levels)} -> ${plan.level}, `
        + `${SMART_STORAGE} ${current.smartStorage} -> ${plan.smartStorage}, ${SMART_FACTORIES} ${current.smartFactories} -> ${plan.smartFactories}, `
        + `${SALES_BOTS} ${current.salesBots} -> ${plan.salesBots} (${billions(plan.cost)}): ${Math.round(plannedSize(plan.level, plan.smartStorage))} storage`
        + ` (employee production ${employeeProduction.toFixed(0)})`);

      /** @type {unknown[][]} */
      const upgradeCalls = [];
      for (let level = wilsonFrom; level < wilson; level++) upgradeCalls.push([WILSON]);
      for (let level = current.smartStorage; level < plan.smartStorage; level++) upgradeCalls.push([SMART_STORAGE]);
      for (let level = current.smartFactories; level < plan.smartFactories; level++) upgradeCalls.push([SMART_FACTORIES]);
      for (let level = current.salesBots; level < plan.salesBots; level++) upgradeCalls.push([SALES_BOTS]);
      const warehouseCalls = ALL_CITIES.map((city, index) => [division, city, plan.level - levels[index]]).filter((call) => Number(call[2]) > 0);
      const officeCalls = ALL_CITIES.map((city, index) => [division, city, plan.officeSize - officeSizes[index]]).filter((call) => Number(call[2]) > 0);
      /** @type {unknown[][]} */
      const hires = [];
      /** @type {unknown[][]} */
      const assignments = [];
      for (const office of offices) {
        for (let hire = office.numEmployees; hire < plan.officeSize; hire++) hires.push([division, office.city, "Unassigned"]);
        for (const job of ["Intern", ...JOBS]) assignments.push([division, office.city, job, 0]);
        for (const job of ["Intern", ...JOBS]) if (jobs[job]) assignments.push([division, office.city, job, jobs[job]]);
      }
      ALL_CITIES.forEach((city) => { planned.levels.set(city, plan.level); planned.officeSizes.set(city, plan.officeSize); });
      planned.smartStorage = plan.smartStorage;
      run = async () => {
        if (upgradeCalls.length) await act(ns, say, "level-upgrade", upgradeCalls);  // Wilson before the Adverts below
        if (adverts > info.numAdVerts) await act(ns, say, "hire-advert", Array.from({ length: adverts - info.numAdVerts }, () => [division]));
        if (warehouseCalls.length) await act(ns, say, "upgrade-warehouse", warehouseCalls);
        if (officeCalls.length) await act(ns, say, "upgrade-office-size", officeCalls);
        if (hires.length) await act(ns, say, "hire-employee", hires);
        await act(ns, say, "set-job-assignment", assignments);
      };
      break;
    }
    case "upgrades": {
      /** @type {unknown[][]} */
      const calls = [];
      for (const [name, target] of Object.entries(/** @type {Counts} */ (entry.levels))) {
        const current = upgrades[name] ?? 0;
        for (let level = current; level < target; level++) { calls.push([name]); cost += upgradeCost(name, level); }
        lines.push(`${name} ${current} -> ${Math.max(current, target)}`);
        if (name === SMART_STORAGE) planned.smartStorage = Math.max(current, target);
      }
      run = async () => { if (calls.length) await act(ns, say, "level-upgrade", calls); };
      break;
    }
    case "staff": {
      // entry.city / entry.exceptCity limit the offices; entry.size "affordable" = the largest size the cash (minus
      // --reserve) buys for each of them, at most entry.maxSize; entry.weights instead of entry.jobs splits by jobSplit.
      const scope = offices.filter((/** @type {{city: string}} */ office) => (!entry.city || office.city === entry.city) && office.city !== entry.exceptCity);
      const sizeNow = (/** @type {{city: string, size: number}} */ office) => go ? office.size : Math.max(office.size, planned.officeSizes.get(office.city) ?? 0);
      let targetSize = Number(entry.size);
      if (entry.size === "affordable") {
        const budget = Math.max(0, (go ? snapshot.corporation.funds : planned.funds) - Number(flags.reserve)) / Math.max(1, scope.length);
        targetSize = Math.min(entry.maxSize ?? Infinity, ...scope.map((/** @type {{city: string, size: number}} */ office) => largestAffordableSize(sizeNow(office), budget)));
      }
      /** @type {unknown[][]} */
      const upgradesCalls = [];
      /** @type {unknown[][]} */
      const hires = [];
      /** @type {unknown[][]} */
      const assignments = [];
      /** @type {Counts} */
      let jobs = entry.jobs ?? {};
      for (const office of scope) {
        // Dry run: an earlier staff step may already have grown the office.
        const size = sizeNow(office);
        const target = Math.max(size, targetSize);
        const increase = target - size;
        if (increase) { upgradesCalls.push([division, office.city, increase]); cost += officeUpgradeCost(size, increase); }
        planned.officeSizes.set(office.city, target);
        if (entry.weights) jobs = jobSplit(target, entry.weights);
        for (let hire = office.numEmployees; hire < target; hire++) hires.push([division, office.city, "Unassigned"]);
        for (const job of ["Intern", ...JOBS]) assignments.push([division, office.city, job, 0]);
        for (const job of ["Intern", ...JOBS]) if (jobs[job]) assignments.push([division, office.city, job, jobs[job]]);
      }
      lines.push(`${scope.length} offices${entry.city ? ` (${entry.city})` : entry.exceptCity ? ` (not ${entry.exceptCity})` : ""} to ${targetSize} employees, jobs ${JSON.stringify(jobs)}`);
      run = async () => {
        if (upgradesCalls.length) await act(ns, say, "upgrade-office-size", upgradesCalls);
        if (hires.length) await act(ns, say, "hire-employee", hires);
        await act(ns, say, "set-job-assignment", assignments);
      };
      break;
    }
    case "research": {
      const target = Number(entry.points ?? flags["research-points"]);
      lines.push(`wait until ${division} has ${target} research points (now ${info.researchPoints.toFixed(1)})`);
      run = async () => {
        while (true) {
          const [current] = await runReader(ns, "divisions", [JSON.stringify([division])]);
          say(`research ${current.researchPoints.toFixed(1)} / ${target}`);
          if (current.researchPoints >= target) break;
          await ns.sleep(RESEARCH_POLL_MS);
        }
      };
      break;
    }
    case "fill": {
      const data = await runReader(ns, "industry-data", [JSON.stringify([info.industry])]);
      const places = info.cities.map((/** @type {string} */ city) => ({ division, city }));
      const materials = info.exists === false ? [] : await runReader(ns, "materials", [JSON.stringify(places)]);
      const fill = Number(entry.fill ?? flags.fill);
      /** @type {{city: string, material: string, amount: number, target: number}[]} */
      const orders = [];
      for (const warehouse of warehouses) {
        // Dry run: the size the earlier planned steps give; a real run reads the actual size.
        const size = go ? warehouse.size : plannedSize(planned.levels.get(warehouse.city) ?? warehouse.level, planned.smartStorage);
        // Best mix on top of what the warehouse holds (lib/corp-boosts.js bestBoostPurchase): held stock counts against the
        // space (an overstocked material shrinks the others), no budget limit (the fill goes on debt).
        const rows = materials.filter((/** @type {{city: string}} */ entryRow) => entryRow.city === warehouse.city);
        const held = Object.fromEntries(BOOST_MATERIALS.map((material) => [material, rows.find((/** @type {{name: string}} */ entryRow) => entryRow.name === material)?.stored ?? 0]));
        const prices = Object.fromEntries(BOOST_MATERIALS.map((material) => [material,
          rows.find((/** @type {{name: string}} */ entryRow) => entryRow.name === material)?.marketPrice || data.baseCosts[material]]));
        const heldSpace = BOOST_MATERIALS.reduce((sum, material) => sum + held[material] * data.sizes[material], 0);
        const space = boostSpaceFor(size, Math.max(0, warehouse.sizeUsed - heldSpace), fill);
        const purchase = bestBoostPurchase(space, held, prices, Infinity, data.industries[info.industry].factors, data.sizes);
        const parts = [];
        for (const [material, amount] of Object.entries(purchase.purchases)) {
          orders.push({ city: warehouse.city, material, amount, target: held[material] + amount });
          parts.push(`${material} ${amount}`);
        }
        cost += purchase.cost;
        lines.push(`${warehouse.city} (${Math.round(size)} storage, ${Math.round(fill * 100)}%): ${parts.join(", ") || "full"}`);
      }
      run = async () => {
        if (!orders.length) return;
        await act(ns, say, "buy-material", orders.map((order) => [division, order.city, order.material, order.amount / SECONDS_PER_MARKET_CYCLE]));
        try {
          // The materials reader returns after each SALE state; the order was paid once the stock reaches the target.
          for (let poll = 0; poll < FILL_POLL_LIMIT; poll++) {
            const stock = await runReader(ns, "materials", [JSON.stringify(places)]);
            const missing = orders.filter((order) => (stock.find((/** @type {{city: string, name: string}} */ row) => row.city === order.city && row.name === order.material)?.stored ?? 0) < order.target * 0.99);
            say(`  buy orders: ${orders.length - missing.length}/${orders.length} delivered`);
            if (!missing.length) return;
          }
          say("  buy orders not fully delivered in time (warehouse full or funds problem?): check the warehouses");
        } finally {
          await act(ns, say, "buy-material", orders.map((order) => [division, order.city, order.material, 0]));
        }
      };
      break;
    }
    default:
      lines.push(`unknown step ${entry.step}`);
  }
  return { lines, cost, run };
}

/** Runs an action worker and reports failures. @param {NS} ns @param {(text: string) => void} say @param {string} action @param {unknown[][]} calls */
async function act(ns, say, action, calls) {
  const results = await runAction(ns, action, calls);
  const failures = results.filter((result) => !result.ok);
  say(`  ${action}: ${results.length - failures.length}/${results.length} ok`);
  for (const failure of failures.slice(0, 5)) say(`  failed ${JSON.stringify(failure.args)}: ${failure.error}`);
}
