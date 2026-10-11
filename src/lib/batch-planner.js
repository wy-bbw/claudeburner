// Batch shapes and RAM allocation for services/batcher.js. Needs Formulas.exe (ns.formulas.hacking).
//
// A batch is four operations landing `spacingMs` apart on a target at min security and max money:
//   hack (steals hackFraction) -> weaken1 (undoes the hack's security) -> grow (back to max) -> weaken2.
// Each operation is exec'd just in time (leadMs before it must start), so a batch holds its threads
// only from its exec until its landing: hack ~1/4 and grow ~4/5 of the weaken time.

export const SECURITY_PER_HACK_THREAD = 0.002, SECURITY_PER_GROW_THREAD = 0.004;
// Hack fractions tried per target; the planner picks one per target (bigger = fewer, fatter batches).
const HACK_FRACTIONS = [0.01, 0.02, 0.03, 0.05, 0.07, 0.1, 0.13, 0.16, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
const MAX_HACK_FRACTION = 0.95;

/**
 * @typedef {{spacingMs: number, leadMs: number, growMargin: number, maxBatchesPerTarget: number}} BatchSettings
 * @typedef {{hackFraction: number, hackThreads: number, growThreads: number, weaken1Threads: number,
 *   weaken2Threads: number, securityRaise: number, hackMs: number, growMs: number, weakenMs: number,
 *   moneyPerBatch: number, threadMsPerBatch: number}} BatchShape
 *   Times are at min security + securityRaise (the most another batch's landing can add), so they
 *   are upper bounds for exec scheduling; the workers wait out the rest.
 * @typedef {{target: string, shapes: BatchShape[], maxBatchesPerSecond: number, preference: number}} TargetOptions
 * @typedef {{target: string, shape: BatchShape, batchesPerSecond: number, threads: number, moneyPerSecond: number}} TargetPlan
 *   threads = steady-state threads in use (batches in flight x their hold times).
 * @typedef {{weaken1Threads: number, growThreads: number, weaken2Threads: number, weakenMs: number, growMs: number}} PrepShape
 */

/** The target as it is once prepped: min security, max money. @param {NS} ns @param {string} host */
export function preparedServer(ns, host) {
  const server = ns.getServer(host);
  server.hackDifficulty = server.minDifficulty;
  server.moneyAvailable = server.moneyMax;
  return server;
}

/**
 * One batch against a prepped server, or null if the fraction can't be hit.
 * @param {NS} ns @param {Server} server prepped @param {Person} player @param {number} hackFraction
 * @param {BatchSettings} settings @returns {BatchShape | null}
 */
export function batchShape(ns, server, player, hackFraction, settings) {
  const formulas = ns.formulas.hacking;
  const maxMoney = server.moneyMax ?? 0, minSecurity = server.minDifficulty ?? 0;
  const perThread = formulas.hackPercent(server, player);
  if (perThread <= 0 || maxMoney <= 0) return null;
  const hackThreads = Math.max(1, Math.floor(hackFraction / perThread));
  const fraction = hackThreads * perThread;
  if (fraction > MAX_HACK_FRACTION) return null;
  const afterHack = { ...server, moneyAvailable: maxMoney * (1 - fraction) };
  const growThreads = Math.ceil(formulas.growThreads(afterHack, player, maxMoney) * settings.growMargin);
  const weakenPerThread = formulas.weakenEffect(1);
  const weaken1Threads = Math.ceil((hackThreads * SECURITY_PER_HACK_THREAD) / weakenPerThread);
  const weaken2Threads = Math.ceil((growThreads * SECURITY_PER_GROW_THREAD) / weakenPerThread);
  const securityRaise = Math.max(hackThreads * SECURITY_PER_HACK_THREAD, growThreads * SECURITY_PER_GROW_THREAD);
  const raised = { ...server, hackDifficulty: minSecurity + securityRaise };
  const hackMs = formulas.hackTime(raised, player), growMs = formulas.growTime(raised, player);
  const weakenMs = formulas.weakenTime(raised, player);
  const lead = settings.leadMs;
  return {
    hackFraction: fraction, hackThreads, growThreads, weaken1Threads, weaken2Threads, securityRaise, hackMs, growMs, weakenMs,
    moneyPerBatch: fraction * maxMoney * formulas.hackChance(server, player),
    threadMsPerBatch: hackThreads * (hackMs + lead) + growThreads * (growMs + lead) + (weaken1Threads + weaken2Threads) * (weakenMs + lead),
  };
}

/**
 * Every batch shape worth considering for a target, smallest hack fraction first.
 * @param {NS} ns @param {string} host @param {Person} player @param {BatchSettings} settings
 * @param {number} preference multiplier on the target's money when allocating (stickiness), not reported
 * @returns {TargetOptions | null}
 */
export function targetOptions(ns, host, player, settings, preference = 1) {
  const server = preparedServer(ns, host);
  /** @type {BatchShape[]} */
  const shapes = [];
  for (const fraction of HACK_FRACTIONS) {
    const shape = batchShape(ns, server, player, fraction, settings);
    if (shape && shape.hackThreads > (shapes[shapes.length - 1]?.hackThreads ?? 0)) shapes.push(shape);
  }
  if (!shapes.length) return null;
  // Batch rate is capped by landing spacing and by the process count (batches in flight per target).
  const maxBatchesPerSecond = Math.min(1000 / (4 * settings.spacingMs),
    (settings.maxBatchesPerTarget * 1000) / (shapes[0].weakenMs + settings.leadMs));
  return { target: host, shapes, maxBatchesPerSecond, preference };
}

/**
 * Splits budgetThreads over targets to maximise money per second.
 * Greedy on marginal $/s per thread: each step either starts a target at its maximum batch rate or
 * moves a running one to a bigger hack fraction (upper hull, so it can skip shapes). Small fractions
 * are the most thread-efficient (grow cost rises faster than linearly), so RAM goes to many targets
 * at small fractions first, and to bigger fractions once the batch rate caps bind.
 * If a target doesn't fit at full rate, the last one runs at a reduced rate with what is left.
 * @param {TargetOptions[]} optionsList @param {number} budgetThreads @returns {Map<string, TargetPlan>}
 */
export function planBatches(optionsList, budgetThreads) {
  /** @type {Map<string, {index: number, rate: number}>} */
  const chosen = new Map();
  /** @type {Set<string>} */
  const saturated = new Set(); // targets whose next upgrade didn't fit
  const threadsAt = (/** @type {BatchShape} */ shape, /** @type {number} */ rate) => (rate * shape.threadMsPerBatch) / 1000;
  let remaining = budgetThreads;

  while (remaining > 0) {
    /** @type {{options: TargetOptions, index: number, addedThreads: number, ratio: number} | null} */
    let best = null;
    for (const options of optionsList) {
      if (saturated.has(options.target)) continue;
      const current = chosen.get(options.target);
      const currentMoney = current ? current.rate * options.shapes[current.index].moneyPerBatch * options.preference : 0;
      const currentThreads = current ? threadsAt(options.shapes[current.index], current.rate) : 0;
      for (let index = (current?.index ?? -1) + 1; index < options.shapes.length; index++) {
        const shape = options.shapes[index];
        const addedThreads = threadsAt(shape, options.maxBatchesPerSecond) - currentThreads;
        const addedMoney = options.maxBatchesPerSecond * shape.moneyPerBatch * options.preference - currentMoney;
        if (addedThreads <= 0 || addedMoney <= 0) continue;
        const ratio = addedMoney / addedThreads;
        if (!best || ratio > best.ratio) best = { options, index, addedThreads, ratio };
      }
    }
    if (!best) break;
    const { options, index, addedThreads } = best;
    if (addedThreads <= remaining) {
      chosen.set(options.target, { index, rate: options.maxBatchesPerSecond });
      remaining -= addedThreads;
    } else if (!chosen.has(options.target)) {
      // Last target: its most efficient shape at whatever rate the rest of the budget allows.
      chosen.set(options.target, { index, rate: (remaining * 1000) / options.shapes[index].threadMsPerBatch });
      break;
    } else {
      saturated.add(options.target);
    }
  }

  /** @type {Map<string, TargetPlan>} */
  const plans = new Map();
  for (const options of optionsList) {
    const choice = chosen.get(options.target);
    if (!choice) continue;
    const shape = options.shapes[choice.index];
    plans.set(options.target, {
      target: options.target, shape, batchesPerSecond: choice.rate,
      threads: threadsAt(shape, choice.rate), moneyPerSecond: choice.rate * shape.moneyPerBatch,
    });
  }
  return plans;
}

/**
 * One prep job for a target in its current state, within availableThreads: weaken1 to min security,
 * grow to max money (landing after weaken1, so at min security), weaken2 for the grow's security.
 * Times are at the current security (the job is exec'd before weaken1 lands).
 * @param {NS} ns @param {Server} server current state @param {Person} player @param {number} availableThreads
 * @param {number} growMargin @returns {PrepShape}
 */
export function prepShape(ns, server, player, availableThreads, growMargin) {
  const formulas = ns.formulas.hacking;
  const weakenPerThread = formulas.weakenEffect(1);
  const extraSecurity = (server.hackDifficulty ?? 0) - (server.minDifficulty ?? 0);
  const weaken1Threads = Math.max(0, Math.min(availableThreads, Math.ceil(extraSecurity / weakenPerThread - 1e-9)));
  const atMinSecurity = { ...server, hackDifficulty: server.minDifficulty };
  const growNeeded = (server.moneyAvailable ?? 0) < (server.moneyMax ?? 0)
    ? Math.ceil(formulas.growThreads(atMinSecurity, player, server.moneyMax ?? 0) * growMargin) : 0;
  const threadsPerGrow = 1 + SECURITY_PER_GROW_THREAD / weakenPerThread;
  const growThreads = Math.max(0, Math.min(growNeeded, Math.floor((availableThreads - weaken1Threads) / threadsPerGrow)));
  const weaken2Threads = Math.ceil((growThreads * SECURITY_PER_GROW_THREAD) / weakenPerThread);
  return { weaken1Threads, growThreads, weaken2Threads, weakenMs: formulas.weakenTime(server, player), growMs: formulas.growTime(server, player) };
}

/** Total threads of a full prep. @param {PrepShape} prep */
export function prepThreads(prep) {
  return prep.weaken1Threads + prep.growThreads + prep.weaken2Threads;
}
