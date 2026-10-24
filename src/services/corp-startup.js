import { appendLog } from "lib/log.js";
import { runAction, runReader } from "lib/corp-scripts.js";
import { BOOST_MATERIALS, bestBoostPurchase, boostSpaceFor, warehouseUpgradeCost } from "lib/corp-boosts.js";
import { upgradeCost } from "lib/corp-upgrades.js";
import { JOBS, officeUpgradeCost } from "lib/corp-offices.js";

// corp-startup.js (home): the startup recipe of the memory note "corp-startup-recipe" as steps, one phase per run:
//   --phase startup        expand to six cities, Smart Supply, Advert 3, warehouses 4, offices to 4 employees all on R&D until
//                          75 research points, Smart Storage 3 / Smart Factories 3, then jobs Operations 1 / Engineer 1 /
//                          Business 1 / Management 1, fill the warehouses
//   --phase after-round-1  after accepting round 1: Wilson 4 + the upgrade targets, warehouses to 2k storage (level 10 with
//                          Smart Storage 10), 6 employees (1/1/2/1/1/0), Advert 16, fill again
// Dry run by default: prints each step with its cash cost (--go does it). Create the corporation and the Agriculture
// division by hand first (no worker for that). The fill is bought last and on debt (bulk purchase; funds may go negative),
// all other steps need cash and stop the run when it is missing. Not the corp manager: start nothing else meanwhile.
// --only <step> runs one step (expand, smart-supply, adverts, warehouses, research, upgrades, staff, fill); "research" only
// waits for the points, the staff step before it puts everyone on R&D.
// Needs the corporation workers (workers/corp/read-*.js, workers/corp/do-*.js) and ~25 GB free on home, one at a time.
// Log: data/corp-startup.txt.
// Usage: run services/corp-startup.js --phase startup [--division <name>] [--fill 0.83] [--research-points 75] [--go]

const LOG_FILE = "data/corp-startup.txt";
const ALL_CITIES = /** @type {CityName[]} */ (["Sector-12", "Aevum", "Chongqing", "New Tokyo", "Ishima", "Volhaven"]);
const RESEARCH_JOB = "Research & Development";
const RESEARCH_POLL_MS = 15_000;
const SMART_STORAGE = "Smart Storage";
const ADVERT_BASE_PRICE = 1e9, ADVERT_PRICE_MULT = 1.06;

/** @typedef {Record<string, number>} Counts */
/** Per phase: the steps in order. @type {Record<string, {step: string, [key: string]: any}[]>} */
const PHASES = {
  startup: [
    { step: "expand" },
    { step: "smart-supply" },
    { step: "adverts", total: 3 },
    { step: "warehouses", level: 4 },
    { step: "staff", size: 4, jobs: { [RESEARCH_JOB]: 4 } },
    { step: "research" },
    { step: "upgrades", levels: { [SMART_STORAGE]: 3, "Smart Factories": 3 } },
    { step: "staff", size: 4, jobs: { Operations: 1, Engineer: 1, Business: 1, Management: 1 } },
    { step: "fill" },
  ],
  "after-round-1": [
    { step: "upgrades", levels: {
      "Wilson Analytics": 4, "Neural Accelerators": 2, "Project Insight": 1, [SMART_STORAGE]: 10, "Speech Processor Implants": 5,
      "ABC SalesBots": 11, "Smart Factories": 10, "Nuoptimal Nootropic Injector Implants": 2, "FocusWires": 5 } },
    { step: "warehouses", level: 10 },
    { step: "staff", size: 6, jobs: { Operations: 1, Engineer: 1, Business: 2, Management: 1, [RESEARCH_JOB]: 1 } },
    { step: "adverts", total: 16 },
    { step: "fill" },
  ],
};

/** @param {number} level @param {number} smartStorage storage of a plain warehouse level (100) times the Smart Storage bonus */
const plannedSize = (level, smartStorage) => 100 * level * (1 + 0.1 * smartStorage);
const billions = (/** @type {number} */ value) => `$${(value / 1e9).toFixed(1)}b`;

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  const flags = ns.flags([["phase", "startup"], ["division", ""], ["fill", 0.83], ["research-points", 75], ["go", false], ["only", ""]]);
  const phase = PHASES[String(flags.phase)];
  if (!phase) { ns.tprint(`--phase must be ${Object.keys(PHASES).join(" or ")}`); return; }
  const go = Boolean(flags.go);
  const say = (/** @type {string} */ text) => { ns.tprint(text); appendLog(ns, LOG_FILE, go ? "go" : "plan", text); };

  const corporation = await runReader(ns, "corporation", []);
  const names = /** @type {string[]} */ (corporation.divisions ?? []);
  const divisionName = String(flags.division) || (names.length === 1 ? names[0] : "");
  if (!divisionName || !names.includes(divisionName)) {
    ns.tprint(`division "${divisionName}" not found among ${JSON.stringify(names)}: create the corporation and the Agriculture division by hand, or pass --division`);
    return;
  }
  say(`${go ? "RUN" : "DRY RUN"} phase ${flags.phase} for ${divisionName}; funds ${billions(corporation.funds)}`);

  // What the dry run assumes the earlier steps did (a real run reads the game again before each step).
  const planned = { funds: corporation.funds, smartStorage: -1, levels: /** @type {Map<string, number>} */ (new Map()),
    officeSizes: /** @type {Map<string, number>} */ (new Map()) };

  for (const entry of phase) {
    if (flags.only && flags.only !== entry.step) continue;
    const snapshot = await readSnapshot(ns, divisionName);
    if (planned.smartStorage < 0) planned.smartStorage = snapshot.upgrades[SMART_STORAGE] ?? 0;
    const cash = go ? snapshot.corporation.funds : planned.funds;
    /** @type {{lines: string[], cost: number, run: () => Promise<void>}} */
    const step = await planStep(ns, entry, snapshot, planned, flags, say);
    say(`[${entry.step}] ${step.lines.join(" | ") || "nothing to do"}${step.cost ? `  cost ${billions(step.cost)} of ${billions(cash)} cash` : ""}`);
    if (entry.step !== "fill" && step.cost > cash) {
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

/** @param {NS} ns @param {string} division */
async function readSnapshot(ns, division) {
  const corporation = await runReader(ns, "corporation", []);
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
 * @param {{funds: number, smartStorage: number, levels: Map<string, number>, officeSizes: Map<string, number>}} planned @param {any} flags @param {(text: string) => void} say
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
    case "smart-supply": {
      const data = await runReader(ns, "industry-data", [JSON.stringify([info.industry])]);
      const produced = /** @type {string[]} */ (data.industries[info.industry].producedMaterials);
      lines.push(`unlock Smart Supply (price: see the game), Smart Supply on and ${produced.join("/") || "nothing"} on MAX at MP in all six cities`);
      run = async () => {
        await act(ns, say, "purchase-unlock", [["Smart Supply"]]);
        await act(ns, say, "set-smart-supply", ALL_CITIES.map((city) => [division, city, true]));
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
        const levels = Math.max(0, entry.level - level);
        if (levels) { calls.push([division, city, levels]); cost += warehouseUpgradeCost(level, levels); }
        planned.levels.set(city, Math.max(level, entry.level));
      }
      lines.push(`warehouses to level ${entry.level} (${calls.length} cities need upgrades)`);
      run = async () => { if (calls.length) await act(ns, say, "upgrade-warehouse", calls); };
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
      const jobs = /** @type {Counts} */ (entry.jobs);
      /** @type {unknown[][]} */
      const upgradesCalls = [];
      /** @type {unknown[][]} */
      const hires = [];
      /** @type {unknown[][]} */
      const assignments = [];
      for (const office of offices) {
        // Dry run: an earlier staff step may already have grown the office.
        const size = go ? office.size : Math.max(office.size, planned.officeSizes.get(office.city) ?? 0);
        const increase = Math.max(0, entry.size - size);
        if (increase) { upgradesCalls.push([division, office.city, increase]); cost += officeUpgradeCost(size, increase); }
        planned.officeSizes.set(office.city, Math.max(size, entry.size));
        for (let hire = office.numEmployees; hire < entry.size; hire++) hires.push([division, office.city, "Unassigned"]);
        for (const job of ["Intern", ...JOBS]) assignments.push([division, office.city, job, 0]);
        for (const job of JOBS) if (jobs[job]) assignments.push([division, office.city, job, jobs[job]]);
      }
      lines.push(`${offices.length} offices to ${entry.size} employees, jobs ${JSON.stringify(jobs)}`);
      run = async () => {
        if (upgradesCalls.length) await act(ns, say, "upgrade-office-size", upgradesCalls);
        if (hires.length) await act(ns, say, "hire-employee", hires);
        await act(ns, say, "set-job-assignment", assignments);
      };
      break;
    }
    case "research": {
      const target = Number(flags["research-points"]);
      lines.push(`wait until ${target} research points (now ${info.researchPoints.toFixed(1)}; the staff step before puts everyone on R&D)`);
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
      const materials = await runReader(ns, "materials", [JSON.stringify(places)]);
      const fill = Number(flags.fill);
      /** @type {unknown[][]} */
      const calls = [];
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
          calls.push([division, warehouse.city, material, amount]);
          parts.push(`${material} ${amount}`);
        }
        cost += purchase.cost;
        lines.push(`${warehouse.city} (${Math.round(size)} storage, ${Math.round(fill * 100)}%): ${parts.join(", ") || "full"}`);
      }
      run = async () => { if (calls.length) await act(ns, say, "bulk-purchase", calls); };
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
