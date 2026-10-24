// Job splits and input-quality checks for services/corp/manager.js, from the game code (v3.0.1, src/Corporation/Division.ts,
// Product.ts, OfficeSpace.ts). Pure functions on the manager's state (lib/corp-state.js shape): no ns calls, no RAM.
// - Research: researchShare of every office's workers on R&D (research points raise product rating x (1 + RP^scienceFactor
//   / 800) and material quality + RP^scienceFactor; each office adds 0.004 x sqrt(R&D production), so spreading pays),
//   except the city that develops a division's products.
// - Development city: the split that develops fastest. Progress per cycle = 0.01 x (Eng^0.34 + Ops^0.2) x
//   (1 + Mgmt / (1.2 x (Ops + Eng + Mgmt))) of that office's job production; Business and R&D do not count.
// - Every other office: the split with the most revenue. Production = (Ops^0.4 + Eng^0.3) x (1 + Mgmt / (1.2 x (Ops + Eng +
//   Mgmt))); sales capacity grows with the business factor (1 + Business)^0.26. Goal per office from what happened last cycle:
//   "production" when most output is exported (sales do not matter), "sales" when sold < 95% of produced (stock piles up:
//   revenue = min(sold x business / business now, produced x production / production now)), else "balanced" (everything
//   sells and the price rises: revenue above market price ~ sqrt(production x business)).
// - Input quality: a product's effective rating = min(rating, input quality x sqrt(rating)); a material's quality = min(q,
//   input quality x sqrt(q)) with q = Eng/90 + RP^scienceFactor + AI Cores^aiCoreFactor / 10000. Market purchases (Smart
//   Supply) come at quality 1 and dilute the stock, so a consumer limited by input quality needs more and better supply.

const RESEARCH_JOB = "Research & Development";
const SHARE_STEP = 1 / 40;
const DEFAULT_PRODUCTION_PER_EMPLOYEE = 100;

/** Production multiplier of an office from job production. @param {number} ops @param {number} eng @param {number} mgmt */
export function productionFactor(ops, eng, mgmt) {
  const total = ops + eng + mgmt;
  return total > 0 ? (ops ** 0.4 + eng ** 0.3) * (1 + mgmt / (1.2 * total)) : 0;
}

/** Product development speed of an office from job production. @param {number} ops @param {number} eng @param {number} mgmt */
export function developmentSpeed(ops, eng, mgmt) {
  const total = ops + eng + mgmt;
  return total > 0 ? (eng ** 0.34 + ops ** 0.2) * (1 + mgmt / (1.2 * total)) : 0;
}

/** @param {number} business job production of Business */
export const businessFactor = (business) => (1 + business) ** 0.26;

/**
 * Best job fractions of `workers` employees (each producing `perEmployee`) for a goal, searched on a 1/40 grid.
 * @param {"development" | "production" | "sales" | "balanced"} goal
 * @param {number} workers @param {number} perEmployee
 * @param {{sold: number, produced: number, current: Record<string, number>}} [sales] for "sales": last cycle and the current job counts
 * @returns {Record<string, number>} employees per job (fractional; lib/corp-offices.js jobSplit rounds)
 */
export function bestSplit(goal, workers, perEmployee, sales) {
  const amount = (/** @type {number} */ fraction) => fraction * workers * perEmployee;
  const current = sales?.current ?? {};
  const productionNow = productionFactor((current.Operations ?? 0) * perEmployee, (current.Engineer ?? 0) * perEmployee, (current.Management ?? 0) * perEmployee) || 1;
  const businessNow = businessFactor((current.Business ?? 0) * perEmployee);
  let best = { value: -1, fractions: { Operations: 0, Engineer: 1, Business: 0, Management: 0 } };
  const steps = Math.round(1 / SHARE_STEP);
  for (let o = 0; o <= steps; o++) {
    for (let e = 0; e <= steps - o; e++) {
      for (let m = 0; m <= steps - o - e; m++) {
        const b = goal === "development" || goal === "production" ? 0 : steps - o - e - m;
        if (o + e + m + b !== steps) continue;
        const [ops, eng, mgmt, business] = [o, e, m, b].map((count) => amount(count / steps));
        let value;
        if (goal === "development") value = developmentSpeed(ops, eng, mgmt);
        else if (goal === "production") value = productionFactor(ops, eng, mgmt);
        else if (goal === "sales" && sales) value = Math.min(sales.sold * businessFactor(business) / businessNow, sales.produced * productionFactor(ops, eng, mgmt) / productionNow);
        else value = productionFactor(ops, eng, mgmt) * businessFactor(business);
        if (value > best.value) best = { value, fractions: { Operations: o / steps, Engineer: e / steps, Business: b / steps, Management: m / steps } };
      }
    }
  }
  return Object.fromEntries(Object.entries(best.fractions).map(([job, fraction]) => [job, fraction * workers]));
}

/**
 * What one office should aim for, from last cycle's numbers.
 * @param {any} state @param {string} divisionName @param {string} city @param {string | null} developmentCity this division's, or null
 * @returns {{goal: "development" | "production" | "sales" | "balanced", sold: number, produced: number}}
 */
export function officeGoal(state, divisionName, city, developmentCity) {
  if (city === developmentCity) return { goal: "development", sold: 0, produced: 0 };
  const rows = [
    ...(state.materials ?? []).filter((/** @type {any} */ row) => row.division === divisionName && row.city === city && row.productionAmount > 0),
    ...(state.products ?? []).filter((/** @type {any} */ row) => row.division === divisionName && row.city === city && row.productionAmount > 0),
  ];
  // Exported output is not unsold: whatever an exporting row does not sell counts as exported (the export amount is a formula).
  const exporting = rows.filter((row) => row.exports?.length), selling = rows.filter((row) => !row.exports?.length);
  const exported = exporting.reduce((sum, row) => sum + Math.max(0, row.productionAmount - (row.actualSellAmount ?? 0)), 0);
  const total = rows.reduce((sum, row) => sum + row.productionAmount, 0);
  const produced = selling.reduce((sum, row) => sum + row.productionAmount, 0);
  const sold = selling.reduce((sum, row) => sum + Math.max(0, row.actualSellAmount ?? 0), 0);
  if (total > 0 && exported >= total / 2) return { goal: "production", sold, produced };
  if (produced > 0 && sold < 0.95 * produced) return { goal: "sales", sold, produced };
  return { goal: "balanced", sold, produced };
}

/**
 * Job weights for an office of `size` employees: interns (from 9 on, 1/9) are left to jobSplit; researchShare of the
 * workers on R&D (none in the development city), the rest by officeGoal.
 * @param {any} state @param {string} divisionName @param {any} office its entry in state.offices (current jobs and production)
 * @param {number} size @param {string | null} developmentCity @param {number} researchShare
 * @returns {{jobs: Record<string, number>, goal: string}}
 */
export function officeJobs(state, divisionName, office, size, developmentCity, researchShare) {
  const workers = size - (size >= 9 ? Math.ceil(size / 9) : 0);
  const working = Math.max(1, (office.numEmployees ?? 0) - (office.employeeJobs?.Intern ?? 0) - (office.employeeJobs?.Unassigned ?? 0));
  const perEmployee = (office.employeeProductionByJob?.total ?? 0) / working || DEFAULT_PRODUCTION_PER_EMPLOYEE;
  const { goal, sold, produced } = officeGoal(state, divisionName, office.city, developmentCity);
  const researchWorkers = goal === "development" ? 0 : workers * researchShare;
  const split = bestSplit(goal, workers - researchWorkers, perEmployee, { sold, produced, current: office.employeeJobs ?? {} });
  return { jobs: { ...split, [RESEARCH_JOB]: researchWorkers }, goal };
}

/**
 * Consumers whose output quality is capped by their input quality: products whose effective rating is < 95% of the rating,
 * and produced materials whose quality is < 95% of what staff, research and AI Cores would give with perfect inputs.
 * @param {any} state @param {{industries: Record<string, {requiredMaterials?: Record<string, number>, producedMaterials: string[],
 *   factors: Record<string, number>, scienceFactor?: number}>}} industryData
 * @returns {{division: string, city: string, inputs: string[], reason: string}[]}
 */
export function inputLimitedConsumers(state, industryData) {
  /** @type {{division: string, city: string, inputs: string[], reason: string}[]} */
  const limited = [];
  const seen = new Set();
  const add = (/** @type {string} */ division, /** @type {string} */ city, /** @type {string} */ reason) => {
    const key = `${division}/${city}`;
    if (seen.has(key)) return;
    seen.add(key);
    const industry = state.divisions.find((/** @type {any} */ entry) => entry.name === division)?.industry;
    limited.push({ division, city, inputs: Object.keys(industryData.industries[industry]?.requiredMaterials ?? {}), reason });
  };
  for (const product of state.products ?? []) {
    if (product.developmentProgress >= 100 && product.rating > 0 && product.effectiveRating < 0.95 * product.rating)
      add(product.division, product.city, `${product.name} effective rating ${product.effectiveRating.toFixed(0)} of ${product.rating.toFixed(0)}`);
  }
  for (const division of state.divisions) {
    const data = industryData.industries[division.industry];
    if (!data || division.makesProducts) continue;
    const inputs = Object.keys(data.requiredMaterials ?? {});
    for (const office of (state.offices ?? []).filter((/** @type {any} */ entry) => entry.division === division.name)) {
      const rows = (state.materials ?? []).filter((/** @type {any} */ row) => row.division === division.name && row.city === office.city);
      const inputQuality = Math.max(1, inputs.reduce((sum, name) => sum + (rows.find((/** @type {any} */ row) => row.name === name)?.quality ?? 1), 0) / Math.max(1, inputs.length));
      const aiCores = rows.find((/** @type {any} */ row) => row.name === "AI Cores")?.stored ?? 0;
      const potential = (office.employeeProductionByJob?.Engineer ?? 0) / 90 + division.researchPoints ** (data.scienceFactor ?? 0)
        + aiCores ** (data.factors["AI Cores"] ?? 0) / 10e3;
      const capped = Math.min(potential, inputQuality * Math.max(Math.sqrt(potential), 1));
      for (const name of data.producedMaterials) {
        const row = rows.find((/** @type {any} */ entry) => entry.name === name);
        if (row && row.productionAmount > 0 && capped < 0.95 * potential)
          add(division.name, office.city, `${name} quality capped at ${capped.toFixed(1)} of ${potential.toFixed(1)} (inputs ${inputQuality.toFixed(1)})`);
      }
    }
  }
  return limited;
}

/**
 * The divisions that export a consumer's inputs to it (they get bigger offices, warehouses and boosts), and the inputs
 * nobody in the corporation supplies (bought at quality 1: a supplier division would be needed).
 * @param {any} state @param {{division: string, city: string, inputs: string[]}[]} consumers
 * @returns {{suppliers: string[], unsupplied: string[]}}
 */
export function suppliersFor(state, consumers) {
  const suppliers = new Set(), unsupplied = new Set();
  for (const consumer of consumers) {
    for (const input of consumer.inputs) {
      const exporters = (state.materials ?? []).filter((/** @type {any} */ row) => row.name === input
        && (row.exports ?? []).some((/** @type {any} */ target) => target.division === consumer.division && target.city === consumer.city));
      if (exporters.length) for (const row of exporters) suppliers.add(row.division);
      else unsupplied.add(`${input} for ${consumer.division}`);
    }
  }
  return { suppliers: [...suppliers], unsupplied: [...unsupplied] };
}
