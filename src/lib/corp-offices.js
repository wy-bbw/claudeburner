// Office size and job split (game code): growing an office from size s by n costs
// 4e9 / 0.09 * 1.09^(s/3) * (1.09^(n/3) - 1). With 9 or more employees at least 1/9 must be interns, otherwise energy
// and morale decay.

const OFFICE_INITIAL_COST = 4e9;
export const JOBS = /** @type {const} */ (["Operations", "Engineer", "Business", "Management", "Research & Development"]);

/** @param {number} size @param {number} increase */
export function officeUpgradeCost(size, increase) {
  return OFFICE_INITIAL_COST / 0.09 * 1.09 ** (size / 3) * (1.09 ** (increase / 3) - 1);
}

/** The largest size reachable from `size` for `budget` (whole employees). @param {number} size @param {number} budget */
export function largestAffordableSize(size, budget) {
  const reachable = 3 * Math.log(budget * 0.09 / OFFICE_INITIAL_COST + 1.09 ** (size / 3)) / Math.log(1.09);
  return Math.max(size, Math.floor(reachable));
}

/**
 * Employees per job for an office of `size`: ceil(size / 9) interns from 9 employees on, the rest split by `weights`
 * (largest remainder).
 * @param {number} size @param {Record<string, number>} weights per job
 * @returns {Record<string, number>} including "Intern"
 */
export function jobSplit(size, weights) {
  const interns = size >= 9 ? Math.ceil(size / 9) : 0;
  const workers = size - interns;
  const jobs = JOBS.filter((job) => (weights[job] ?? 0) > 0);
  const total = jobs.reduce((sum, job) => sum + weights[job], 0);
  /** @type {Record<string, number>} */
  const split = Object.fromEntries(JOBS.map((job) => [job, 0]));
  if (!total) return { ...split, Intern: interns };
  const exact = jobs.map((job) => ({ job, value: workers * weights[job] / total }));
  for (const { job, value } of exact) split[job] = Math.floor(value);
  let left = workers - exact.reduce((sum, { job }) => sum + split[job], 0);
  for (const { job } of [...exact].sort((a, b) => (b.value % 1) - (a.value % 1))) {
    if (left-- <= 0) break;
    split[job]++;
  }
  return { ...split, Intern: interns };
}
