import { scanAll } from "lib/net.js";
import { countOpeners, tryRoot } from "lib/targets.js";
import { TARGET_PORT } from "lib/ports.js";

const HACK_WORKER = "workers/hack.js", GROW_WORKER = "workers/grow.js", WEAKEN_WORKER = "workers/weaken.js";
const SHARE_WORKER = "workers/share.js";
// Pre-rename worker paths; their running jobs are still adopted (and old share workers stopped).
const LEGACY_GROW_WORKER = "w/g.js", LEGACY_WEAKEN_WORKER = "w/w.js", LEGACY_SHARE_WORKER = "w/share.js";
const STATE_FILE = "data/state.txt";

// Security change per thread (game constants).
const SECURITY_PER_HACK_THREAD = 0.002, SECURITY_PER_GROW_THREAD = 0.004, SECURITY_PER_WEAKEN_THREAD = 0.05;

const MAX_HACK_FRACTION = 0.25;     // max share of a target's money stolen per cycle: small bites are cheaper per thread
const SCORING_HACK_FRACTION = 0.1;  // hack fraction assumed when ranking targets
const MAX_PREP_MINUTES = 60;        // don't start preps estimated to take longer than this
// A target in hack mode stays there while money and security are within these bounds...
const STAY_HACKING_MIN_MONEY = 0.5;
const STAY_HACKING_MAX_EXTRA_SECURITY = 5;
// ...and enters hack mode within these. Prep ends early: the hack job tops up the rest (grow is
// multiplicative, so the last 25% is cheap) and removes extra security in the same cycle, so leftovers
// only slow the FIRST cycle (phantasy at +5: 1.56x), while waiting costs a whole cycle without income.
// So security uses the same bound for start and stay; the hysteresis is on money only.
const START_HACKING_MIN_MONEY = 0.75;
const START_HACKING_MAX_EXTRA_SECURITY = STAY_HACKING_MAX_EXTRA_SECURITY;

/** Target lifecycle: prep until min security / max money, then hack. Also the kind of a job. */
const Mode = Object.freeze({ PREP: "prep", HACK: "hack" });
/** @typedef {typeof Mode[keyof typeof Mode]} ModeName */

/**
 * Thread counts for one job against one target.
 * Hack jobs put all their weaken into weakenThreads; prep jobs split it into the weaken that lowers
 * security before the grow lands and the weaken that cancels the grow's own security increase.
 * @typedef {{kind: ModeName, hackFraction: number, hackThreads: number, growThreads: number,
 *   weakenThreads: number, weakenAfterGrowThreads: number}} Job
 */
/** @typedef {{endsAt: number, growThreads: number, weakenThreads: number, weakenLandsAt: number}} PrepInFlight */
/**
 * The hack job currently running against a target. Its hack threads free their RAM at hackEndsAt
 * and its grow threads at growEndsAt, long before the whole job ends.
 * @typedef {{endsAt: number, totalThreads: number, hackFraction: number, hackThreads: number,
 *   growThreads: number, hackEndsAt: number, growEndsAt: number}} RunningHackJob
 */
/** @typedef {{mode: ModeName, prepsInFlight: PrepInFlight[], hackJob: RunningHackJob | null}} TargetState */
/** @typedef {{host: string, freeThreads: number}} HostCapacity */

// Multi-target controller.
//   Targets are in "prep" mode until >= 75% money and security <= min+5, then in "hack" mode, where
//   they stay while money >= 50% and security <= min+5 (each hack job also repairs drift).
//   1. hack-mode targets: one job per weaken time, best modelled $/s per thread first
//   1b. share workers topped up to --rep of all RAM (faction rep boost), out of prep's share
//   2. prep-mode targets in score order with what's left (minus a reservation so hack targets
//      find their RAM again). Prep jobs stack: only threads not already in flight are added, so
//      the focused target gets everything it needs first. Grow lands after the weakens.
// Runs on a rooted server. Uses home RAM too, except --home-reserve GB (agent, metrics, tools).
// flags: --only <target> (experiments), --rep <fraction of RAM for share workers, default 0.1 (measured: ~same rep boost as 0.25)>,
//        --home-reserve <GB kept free on home, default 64: agent, metrics, coding-contracts service, tools>
/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  const controllerHost = ns.getHostname();
  const threadRam = Math.max(ns.getScriptRam(HACK_WORKER, "home"), ns.getScriptRam(GROW_WORKER, "home"), ns.getScriptRam(WEAKEN_WORKER, "home"));
  const shareThreadRam = ns.getScriptRam(SHARE_WORKER, "home");
  // Not "--share": the RAM calculator would bill `flags.share` as ns.share() (2.4 GB).
  const flags = ns.flags([["only", ""], ["rep", 0.1], ["home-reserve", 64]]);
  const onlyTarget = String(flags.only);
  const shareFraction = Number(flags.rep);
  const homeReserveGb = Number(flags["home-reserve"]);

  for (const host of scanAll(ns).keys()) if (host !== "home") ns.scriptKill(LEGACY_SHARE_WORKER, host);

  /** @type {Map<string, TargetState>} */
  const targetStates = new Map();
  const stateOf = (/** @type {string} */ target) => {
    if (!targetStates.has(target)) targetStates.set(target, { mode: Mode.PREP, prepsInFlight: [], hackJob: null });
    return /** @type {TargetState} */ (targetStates.get(target));
  };
  adoptRunningJobs(ns, stateOf, targetStates);

  /** @type {string[]} */
  let rootedHosts = [];
  let portOpeners = 0;
  let prepFocus = ""; // prep target that gets RAM first until it's done
  let nextJobId = Date.now(); // unique across restarts, so job args never collide with adopted ones

  for (let tick = 0; ; tick++) {
    if (tick % 10 === 0) {
      const hosts = [...scanAll(ns).keys()].filter((host) => host !== "home");
      portOpeners = countOpeners(ns);
      for (const host of hosts) tryRoot(ns, host, portOpeners);
      rootedHosts = hosts.filter((host) => ns.hasRootAccess(host));
      for (const host of rootedHosts) {
        if (host !== controllerHost && ns.getServerMaxRam(host) > 0) ns.scp([HACK_WORKER, GROW_WORKER, WEAKEN_WORKER, SHARE_WORKER], host, "home");
      }
    }

    const now = Date.now();
    const hackingLevel = ns.getHackingLevel();
    // Workers run on every rooted server plus home (minus a reserve for the agent and tools).
    const workerHosts = [...rootedHosts, "home"];
    const usableRam = (/** @type {string} */ host) => Math.max(0, ns.getServerMaxRam(host) - (host === "home" ? homeReserveGb : 0));
    const freeRam = (/** @type {string} */ host) => Math.max(0, usableRam(host) - ns.getServerUsedRam(host));
    /** @type {HostCapacity[]} */
    const capacity = workerHosts.map((host) => ({ host, freeThreads: Math.floor(freeRam(host) / threadRam) }));
    const totalThreads = workerHosts.reduce((sum, host) => sum + Math.floor(usableRam(host) / threadRam), 0);
    const freeThreads = () => capacity.reduce((sum, c) => sum + c.freeThreads, 0);

    const targets = rootedHosts
      .filter((host) => (!onlyTarget || host === onlyTarget) && ns.getServerMaxMoney(host) > 0 && ns.getServerRequiredHackingLevel(host) <= hackingLevel)
      .map((host) => ({ target: host, score: scoreTarget(ns, host, hackingLevel) }))
      .sort((a, b) => b.score - a.score);

    for (const { target } of targets) {
      const state = stateOf(target);
      state.prepsInFlight = state.prepsInFlight.filter((prep) => prep.endsAt > now);
      if (state.hackJob && state.hackJob.endsAt <= now) state.hackJob = null;
      const moneyFraction = ns.getServerMoneyAvailable(target) / ns.getServerMaxMoney(target);
      const extraSecurity = ns.getServerSecurityLevel(target) - ns.getServerMinSecurityLevel(target);
      if (state.mode === Mode.HACK && (moneyFraction < STAY_HACKING_MIN_MONEY || extraSecurity > STAY_HACKING_MAX_EXTRA_SECURITY)) {
        state.mode = Mode.PREP;
      } else if (state.mode === Mode.PREP && state.prepsInFlight.length === 0
        && moneyFraction >= START_HACKING_MIN_MONEY && extraSecurity <= START_HACKING_MAX_EXTRA_SECURITY) {
        state.mode = Mode.HACK;
      }
    }

    /** @param {string} target @param {Job} job */
    const launch = (target, job) => {
      const state = stateOf(target), jobId = nextJobId++;
      const weakenTime = ns.getWeakenTime(target), growTime = ns.getGrowTime(target);
      let started;
      if (job.kind === Mode.PREP) {
        // Grow lands 100 ms after the last weaken already in flight (or this job's own), at min security.
        const ownWeakenLandsAt = job.weakenThreads > 0 ? now + weakenTime : 0;
        const lastWeakenLandsAt = Math.max(ownWeakenLandsAt, ...state.prepsInFlight.map((prep) => prep.weakenLandsAt), now);
        const growLandsAt = Math.max(lastWeakenLandsAt, now + growTime) + 100;
        const weakenThreads = startThreads(ns, capacity, WEAKEN_WORKER, job.weakenThreads, target, jobId, 0);
        const growThreads = startThreads(ns, capacity, GROW_WORKER, job.growThreads, target, jobId, growLandsAt - now - growTime);
        const weakenAfterGrowThreads = startThreads(ns, capacity, WEAKEN_WORKER, job.weakenAfterGrowThreads, target, jobId,
          growLandsAt + 100 - now - weakenTime);
        state.prepsInFlight.push({
          endsAt: Math.max(now + weakenTime, growLandsAt + 100) + 300,
          growThreads,
          weakenThreads,
          weakenLandsAt: ownWeakenLandsAt,
        });
        started = weakenThreads + growThreads + weakenAfterGrowThreads;
      } else {
        const hackThreads = startThreads(ns, capacity, HACK_WORKER, job.hackThreads, target, jobId, 0);
        const growThreads = startThreads(ns, capacity, GROW_WORKER, job.growThreads, target, jobId, 0);
        const weakenThreads = startThreads(ns, capacity, WEAKEN_WORKER, job.weakenThreads, target, jobId, 0);
        started = hackThreads + growThreads + weakenThreads;
        // Nothing started (no free RAM): stay idle, so the target keeps reserving its next job
        // instead of counting as busy for a whole cycle while prep takes all the RAM.
        if (started > 0) state.hackJob = {
          endsAt: now + weakenTime + 500,
          totalThreads: started,
          hackFraction: job.hackFraction,
          hackThreads,
          growThreads,
          hackEndsAt: now + ns.getHackTime(target),
          growEndsAt: now + growTime,
        };
      }
      ns.print(`${job.kind} ${target}: hack=${job.hackThreads} grow=${job.growThreads} weaken=${job.weakenThreads}+${job.weakenAfterGrowThreads}`
        + ` fraction=${job.hackFraction.toFixed(3)} started=${started}`);
    };

    // 1. hack-mode targets
    for (const { target } of targets) {
      const state = stateOf(target);
      if (state.mode !== Mode.HACK || state.hackJob) continue;
      const job = planHack(ns, target, freeThreads());
      // A weaken-only job means there was no room to hack or regrow: wait for the reserved RAM.
      if (job.hackThreads > 0 || job.growThreads > 0) launch(target, job);
    }

    // 1b. top up share workers, then refresh the capacity view for prep
    const totalRam = workerHosts.reduce((sum, host) => sum + usableRam(host), 0);
    const shareThreadsWanted = Math.floor((shareFraction * totalRam) / shareThreadRam);
    const shareThreadsOn = (/** @type {string} */ host) => ns.ps(host).filter((process) => process.filename === SHARE_WORKER).reduce((sum, process) => sum + process.threads, 0);
    let shareThreads = workerHosts.reduce((sum, host) => sum + shareThreadsOn(host), 0);
    for (const host of workerHosts) { // over target (fraction lowered): stop whole hosts' share workers
      if (shareThreads <= shareThreadsWanted) break;
      const onHost = shareThreadsOn(host);
      if (onHost > 0 && ns.scriptKill(SHARE_WORKER, host)) shareThreads -= onHost;
    }
    for (const host of workerHosts) {
      if (shareThreads >= shareThreadsWanted) break;
      const toStart = Math.min(shareThreadsWanted - shareThreads, Math.floor(freeRam(host) / shareThreadRam));
      if (toStart > 0 && ns.exec(SHARE_WORKER, host, toStart)) shareThreads += toStart;
    }
    for (const c of capacity) c.freeThreads = Math.floor(freeRam(c.host) / threadRam);

    // 2. prep-mode targets, minus the RAM hack targets will want back:
    //    busy ones reserve what their finished hack/grow threads freed (the rest is still in use),
    //    idle ones (waiting for RAM) their next job's size, or prep starves them.
    //    Prep targets already within the start bounds (only waiting for their last prep jobs) reserve
    //    their first hack job too, or a long prep elsewhere grabs the RAM just before they switch.
    const aboutToHack = (/** @type {string} */ target) => stateOf(target).mode === Mode.PREP
      && ns.getServerMoneyAvailable(target) >= ns.getServerMaxMoney(target) * START_HACKING_MIN_MONEY
      && ns.getServerSecurityLevel(target) - ns.getServerMinSecurityLevel(target) <= START_HACKING_MAX_EXTRA_SECURITY;
    const reservedThreads = targets.filter(({ target }) => stateOf(target).mode === Mode.HACK || aboutToHack(target)).reduce((sum, { target }) => {
      const job = stateOf(target).hackJob;
      // Adopted after a restart (fraction 0, unknown shape): reserve the full next job like an idle target.
      if (job && job.hackFraction > 0) return sum + (now >= job.hackEndsAt ? job.hackThreads : 0) + (now >= job.growEndsAt ? job.growThreads : 0);
      return sum + jobThreads(planHack(ns, target, totalThreads));
    }, 0);
    const prepCapacity = Math.max(1, totalThreads - reservedThreads);
    // Sticky focus: scores shift with level, so without it RAM hops between half-prepped targets.
    // New focus = best score per remaining prep cycle (a nearly done target beats a better empty one).
    const prepCandidates = targets
      .filter(({ target }) => stateOf(target).mode === Mode.PREP && prepMinutes(ns, target, prepCapacity) <= MAX_PREP_MINUTES)
      .map(({ target, score }) => ({ target, priority: score / (1 + remainingPrepThreads(ns, target, stateOf(target).prepsInFlight) / prepCapacity) }))
      .sort((a, b) => b.priority - a.priority);
    if (!prepCandidates.some((c) => c.target === prepFocus)) prepFocus = prepCandidates[0]?.target ?? "";
    const prepOrder = [...prepCandidates.filter((c) => c.target === prepFocus), ...prepCandidates.filter((c) => c.target !== prepFocus)];
    for (const { target } of prepOrder) {
      if (freeThreads() - reservedThreads <= 0) break;
      const job = planPrep(ns, target, freeThreads() - reservedThreads, stateOf(target).prepsInFlight);
      if (jobThreads(job) > 0) launch(target, job);
    }

    // Metrics sampler follows the best hack-mode target.
    const metricsTarget = targets.find(({ target }) => stateOf(target).mode === Mode.HACK)?.target ?? targets[0]?.target ?? "";
    if (metricsTarget && String(ns.peek(TARGET_PORT)) !== metricsTarget) {
      ns.clearPort(TARGET_PORT);
      ns.writePort(TARGET_PORT, metricsTarget);
    }

    if (tick % 5 === 0) {
      const snapshot = {
        time: now,
        hacking: hackingLevel,
        money: ns.getServerMoneyAvailable("home"),
        portOpeners,
        threads: { total: totalThreads, free: freeThreads(), reserved: reservedThreads },
        prepFocus,
        share: { threads: shareThreads, wanted: shareThreadsWanted, power: ns.getSharePower() },
        targets: targets.slice(0, 12).map(({ target, score }) => {
          const state = stateOf(target);
          return {
            target,
            score: Math.round(score),
            mode: state.mode,
            moneyPercent: Math.round((100 * ns.getServerMoneyAvailable(target)) / ns.getServerMaxMoney(target)),
            extraSecurity: +(ns.getServerSecurityLevel(target) - ns.getServerMinSecurityLevel(target)).toFixed(1),
            hackFraction: +(state.hackJob?.hackFraction ?? 0).toFixed(3),
            prepsInFlight: state.prepsInFlight.length,
            growThreadsInFlight: state.prepsInFlight.reduce((sum, prep) => sum + prep.growThreads, 0),
          };
        }),
      };
      ns.write(STATE_FILE, JSON.stringify(snapshot), "w");
      if (controllerHost !== "home") ns.scp(STATE_FILE, "home", controllerHost);
    }

    await ns.sleep(1000);
  }
}

/**
 * After a restart, adopt grow/weaken jobs still running from the previous controller (upper-bound
 * timing) so they aren't launched twice. Targets with enough money to start hacking were (almost
 * certainly) being hacked: they stay
 * in hack mode, busy until the adopted jobs end, instead of losing a whole cycle of income.
 * @param {NS} ns @param {(target: string) => TargetState} stateOf @param {Map<string, TargetState>} targetStates
 */
function adoptRunningJobs(ns, stateOf, targetStates) {
  for (const host of scanAll(ns).keys()) {
    for (const process of ns.ps(host)) {
      const isGrow = process.filename === GROW_WORKER || process.filename === LEGACY_GROW_WORKER;
      const isWeaken = process.filename === WEAKEN_WORKER || process.filename === LEGACY_WEAKEN_WORKER;
      if (!isGrow && !isWeaken) continue;
      const target = String(process.args[0]);
      const endsAt = Date.now() + ns.getWeakenTime(target) + 500;
      stateOf(target).prepsInFlight.push({
        endsAt,
        growThreads: isGrow ? process.threads : 0,
        weakenThreads: isWeaken ? process.threads : 0,
        weakenLandsAt: endsAt,
      });
    }
  }
  for (const [target, state] of targetStates) {
    if (ns.getServerMoneyAvailable(target) < ns.getServerMaxMoney(target) * START_HACKING_MIN_MONEY) continue;
    const endsAt = Math.max(...state.prepsInFlight.map((prep) => prep.endsAt));
    const totalThreads = state.prepsInFlight.reduce((sum, prep) => sum + prep.growThreads + prep.weakenThreads, 0);
    state.mode = Mode.HACK;
    state.hackJob = { endsAt, totalThreads, hackFraction: 0, hackThreads: 0, growThreads: 0, hackEndsAt: endsAt, growEndsAt: endsAt };
    state.prepsInFlight = [];
  }
}

/** @param {Job} job */
export function jobThreads(job) {
  return job.hackThreads + job.growThreads + job.weakenThreads + job.weakenAfterGrowThreads;
}

// Grow threads for a money multiplier (game formula, verified against growthAnalyze: rate capped at 1.0035).
/** @param {number} multiplier @param {number} security @param {number} serverGrowth */
function modelGrowThreads(multiplier, security, serverGrowth) {
  return Math.log(multiplier) / Math.log(Math.min(1.0035, 1 + 0.03 / security)) / (serverGrowth / 100);
}

// Modelled steady-state $/s per thread at min security, hacking SCORING_HACK_FRACTION per cycle.
/** @param {NS} ns @param {string} target @param {number} hackingLevel */
function scoreTarget(ns, target, hackingLevel) {
  const requiredLevel = ns.getServerRequiredHackingLevel(target), minSecurity = ns.getServerMinSecurityLevel(target);
  const maxMoney = ns.getServerMaxMoney(target), serverGrowth = ns.getServerGrowth(target);
  const securityFactor = (100 - minSecurity) / 100;
  const hackChance = Math.min(1, Math.max(0, ((1.75 * hackingLevel - requiredLevel) / (1.75 * hackingLevel)) * securityFactor));
  const stolenPerThread = (securityFactor * ((hackingLevel - (requiredLevel - 1)) / hackingLevel)) / 240;
  if (stolenPerThread <= 0 || hackChance <= 0) return 0;
  const weakenSeconds = (4 * 5 * (2.5 * requiredLevel * minSecurity + 500)) / (hackingLevel + 50);
  const hackThreads = SCORING_HACK_FRACTION / stolenPerThread;
  const growThreads = modelGrowThreads(1 / (1 - SCORING_HACK_FRACTION), minSecurity, serverGrowth) * 1.05;
  const weakenThreads = (hackThreads * SECURITY_PER_HACK_THREAD + growThreads * SECURITY_PER_GROW_THREAD) / SECURITY_PER_WEAKEN_THREAD;
  return (SCORING_HACK_FRACTION * maxMoney * hackChance) / weakenSeconds / (hackThreads + growThreads + weakenThreads);
}

// Grow threads needed to reach max money from fromMoney, assuming the grow lands at min security.
/** @param {NS} ns @param {string} target @param {number} fromMoney */
function growThreadsToMax(ns, target, fromMoney) {
  const maxMoney = ns.getServerMaxMoney(target);
  if (fromMoney >= maxMoney) return 0;
  const minSecurity = ns.getServerMinSecurityLevel(target);
  const multiplier = maxMoney / Math.max(fromMoney, 1);
  // growthAnalyze uses current security; when we're above min, use the model at min instead.
  if (ns.getServerSecurityLevel(target) > minSecurity + 1) return Math.ceil(modelGrowThreads(multiplier, minSecurity, ns.getServerGrowth(target)));
  return Math.ceil(ns.growthAnalyze(target, multiplier));
}

// Estimated minutes to prep target with threadsPerCycle threads per weaken cycle.
/** @param {NS} ns @param {string} target @param {number} threadsPerCycle */
function prepMinutes(ns, target, threadsPerCycle) {
  const extraSecurity = ns.getServerSecurityLevel(target) - ns.getServerMinSecurityLevel(target);
  const growThreads = growThreadsToMax(ns, target, ns.getServerMoneyAvailable(target));
  const threads = growThreads * (1 + SECURITY_PER_GROW_THREAD / SECURITY_PER_WEAKEN_THREAD) + extraSecurity / SECURITY_PER_WEAKEN_THREAD;
  return (Math.ceil(threads / threadsPerCycle) * ns.getWeakenTime(target)) / 60000;
}

// Total prep threads still needed beyond what's in flight.
/** @param {NS} ns @param {string} target @param {PrepInFlight[]} prepsInFlight */
function remainingPrepThreads(ns, target, prepsInFlight) {
  return jobThreads(planPrep(ns, target, Infinity, prepsInFlight));
}

// Prep threads still needed beyond what's in flight, within availableThreads.
/** @param {NS} ns @param {string} target @param {number} availableThreads @param {PrepInFlight[]} prepsInFlight @returns {Job} */
function planPrep(ns, target, availableThreads, prepsInFlight) {
  const extraSecurity = ns.getServerSecurityLevel(target) - ns.getServerMinSecurityLevel(target);
  const weakenInFlight = prepsInFlight.reduce((sum, prep) => sum + prep.weakenThreads, 0);
  const growInFlight = prepsInFlight.reduce((sum, prep) => sum + prep.growThreads, 0);
  const weakenThreads = Math.max(0, Math.min(availableThreads, Math.ceil(extraSecurity / SECURITY_PER_WEAKEN_THREAD) - weakenInFlight));
  const growNeeded = growThreadsToMax(ns, target, ns.getServerMoneyAvailable(target)) - growInFlight;
  const growThreads = Math.max(0, Math.min(growNeeded,
    Math.floor((availableThreads - weakenThreads) / (1 + SECURITY_PER_GROW_THREAD / SECURITY_PER_WEAKEN_THREAD))));
  const weakenAfterGrowThreads = Math.ceil((growThreads * SECURITY_PER_GROW_THREAD) / SECURITY_PER_WEAKEN_THREAD);
  return { kind: Mode.PREP, hackFraction: 0, hackThreads: 0, growThreads, weakenThreads, weakenAfterGrowThreads };
}

// Largest hack (fraction <= MAX_HACK_FRACTION) whose threads fit availableThreads; grow and weaken
// also repair any drift (money below max, security above min) so a hack-mode target stays healthy.
/** @param {NS} ns @param {string} target @param {number} availableThreads @returns {Job} */
export function planHack(ns, target, availableThreads) {
  const money = ns.getServerMoneyAvailable(target);
  const extraSecurity = ns.getServerSecurityLevel(target) - ns.getServerMinSecurityLevel(target);
  const stolenPerThread = ns.hackAnalyze(target);
  const jobFor = (/** @type {number} */ hackThreads) => {
    const hackFraction = Math.min(hackThreads * stolenPerThread, 0.95);
    const growThreads = Math.ceil(growThreadsToMax(ns, target, money * (1 - hackFraction)) * 1.05); // margin: grow lands at raised security
    const weakenThreads = Math.ceil((extraSecurity
      + hackThreads * SECURITY_PER_HACK_THREAD + growThreads * SECURITY_PER_GROW_THREAD) / SECURITY_PER_WEAKEN_THREAD) + 1;
    return { kind: Mode.HACK, hackFraction, hackThreads, growThreads, weakenThreads, weakenAfterGrowThreads: 0 };
  };
  // Binary search for the most hack threads that still fit.
  let fits = 0, tooMany = Math.max(1, Math.floor(MAX_HACK_FRACTION / stolenPerThread)) + 1;
  while (tooMany - fits > 1) {
    const middle = Math.floor((fits + tooMany) / 2);
    if (jobThreads(jobFor(middle)) <= availableThreads) fits = middle; else tooMany = middle;
  }
  const job = jobFor(fits);
  if (job.growThreads + job.weakenThreads > availableThreads) { // can't even repair fully: repair what fits
    job.weakenThreads = Math.min(job.weakenThreads, availableThreads);
    job.growThreads = Math.max(0, Math.min(job.growThreads, availableThreads - job.weakenThreads));
  }
  return job;
}

/**
 * Spread threads of a worker script over hosts; returns threads actually started.
 * @param {NS} ns @param {HostCapacity[]} capacity @param {string} script @param {number} threads
 * @param {string} target @param {number} jobId @param {number} delayMs
 */
function startThreads(ns, capacity, script, threads, target, jobId, delayMs) {
  let started = 0;
  for (const host of capacity) {
    if (started >= threads) break;
    const count = Math.min(host.freeThreads, threads - started);
    if (count < 1) continue;
    if (ns.exec(script, host.host, count, target, jobId, Math.max(0, Math.round(delayMs)))) {
      host.freeThreads -= count;
      started += count;
    }
  }
  return started;
}
