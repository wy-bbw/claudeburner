import { scanAll } from "lib/net.js";
import { countOpeners, tryRoot } from "lib/targets.js";
import { TARGET_PORT } from "lib/ports.js";
import { appendLog } from "lib/log.js";
import { planBatches, prepShape, prepThreads, preparedServer, targetOptions } from "lib/batch-planner.js";

const HACK_WORKER = "workers/batch-hack.js", GROW_WORKER = "workers/batch-grow.js", WEAKEN_WORKER = "workers/batch-weaken.js";
const SHARE_WORKER = "workers/share.js";
// Workers of services/controller.js: a target with any of them running is left alone until they end.
const CONTROLLER_WORKERS = ["workers/hack.js", "workers/grow.js", "workers/weaken.js", "w/g.js", "w/w.js"];
const STATE_FILE = "data/state.txt", LOG_FILE = "data/batcher.txt";

const TICK_MS = 100;
const LEAD_MS = 1000;           // operations are exec'd this long before they must start; the worker waits the rest
const PLAN_INTERVAL_MS = 10_000;
const PLAN_BUDGET_SHARE = 0.9;  // the plan's steady state uses this share of the non-share threads; the rest absorbs ramp-ups
const GROW_MARGIN = 1.05;       // grow threads x this: hacks that land after a level-up steal a bit more
const MAX_PREP_MINUTES = 30;    // targets whose prep would take longer (with a quarter of the budget) are not planned
const STICKY_PREFERENCE = 1.1;  // targets already batching or prepping keep their place on near ties
const READY_MAX_EXTRA_SECURITY = 0.01, READY_MIN_MONEY = 0.99;

/** Target lifecycle. DRAIN: no new batches, waiting for its in-flight operations to land. */
const Mode = Object.freeze({ IDLE: "idle", PREP: "prep", BATCH: "batch", DRAIN: "drain" });
/** @typedef {typeof Mode[keyof typeof Mode]} ModeName */
/** @typedef {import("lib/batch-planner.js").TargetPlan} TargetPlan */
/**
 * @typedef {{id: number, target: string, cancelled: boolean, hackFraction: number, securityRaise: number, endsAt: number}} Batch
 *   A prep job is a batch without hack. cancelled: an operation failed to start, so the batch's later
 *   operations are skipped (they run in the order weaken, grow, hack, so skipping is always safe).
 * @typedef {{script: string, execAt: number, landAt: number, threads: number, batch: Batch}} Operation
 * @typedef {{mode: ModeName, plan: TargetPlan | null, nextLandAt: number, lastLandAt: number,
 *   batches: Batch[], running: {threads: number, landAt: number}[]}} TargetRuntime
 * @typedef {{host: string, freeThreads: number}} HostCapacity
 */

// HWGW batcher (needs Formulas.exe; start.js picks it over services/controller.js once owned).
//   Every PLAN_INTERVAL_MS: root, copy workers, plan. The plan (lib/batch-planner.js) splits the threads
//   over targets as if all were prepped, picking a hack fraction and batch rate per target.
//   Planned targets that are prepped run batches: one every 1/rate s, landing hack, weaken, grow, weaken
//   --spacing ms apart. Each operation is exec'd LEAD_MS before it must start and gets its landing time,
//   so it holds RAM only while it runs. Unprepped planned targets get one prep job at a time, using RAM
//   the running batches have not reserved; spare RAM preps the next-best targets.
//   A batch target whose money or security leaves its batch bounds (desync) drains and is prepped again.
// Runs on a rooted server. Uses home RAM too, except --home-reserve GB.
// flags: --rep <fraction of RAM for share workers, default 0.1>, --home-reserve <GB, default 64>,
//        --spacing <ms between landings, default 30>, --batches-per-target <max in flight, default 400>,
//        --only <target>
// Log (readable lines): data/batcher.txt; snapshot: data/state.txt.
/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  if (!ns.fileExists("Formulas.exe", "home")) {
    ns.tprint("batcher needs Formulas.exe; use services/controller.js until then");
    return;
  }
  // Not "--share": the RAM calculator would bill `flags.share` as ns.share() (2.4 GB).
  const flags = ns.flags([["rep", 0.1], ["home-reserve", 64], ["spacing", 30], ["batches-per-target", 400], ["only", ""]]);
  const shareFraction = Number(flags.rep), homeReserveGb = Number(flags["home-reserve"]);
  const spacingMs = Number(flags.spacing), onlyTarget = String(flags.only);
  const settings = { spacingMs, leadMs: LEAD_MS, growMargin: GROW_MARGIN, maxBatchesPerTarget: Number(flags["batches-per-target"]) };
  const threadRam = Math.max(ns.getScriptRam(HACK_WORKER, "home"), ns.getScriptRam(GROW_WORKER, "home"), ns.getScriptRam(WEAKEN_WORKER, "home"));
  const shareThreadRam = ns.getScriptRam(SHARE_WORKER, "home");
  const log = (/** @type {string} */ event, /** @type {string} */ details) => appendLog(ns, LOG_FILE, event, details);
  const controllerHost = ns.getHostname();

  /** @type {Map<string, TargetRuntime>} */
  const runtimes = new Map();
  const runtimeOf = (/** @type {string} */ target) => {
    if (!runtimes.has(target)) runtimes.set(target, { mode: Mode.IDLE, plan: null, nextLandAt: 0, lastLandAt: 0, batches: [], running: [] });
    return /** @type {TargetRuntime} */ (runtimes.get(target));
  };
  /** @type {Operation[]} sorted by execAt */
  const queue = [];
  /** @type {Map<string, Server>} prepped server objects for hack threads at exec time, refreshed with the plan */
  const preparedServers = new Map();
  /** @type {Set<string>} targets with controller workers still running */
  let foreignTargets = new Set();
  /** @type {string[]} */
  let rootedHosts = [];
  let portOpeners = 0, nextBatchId = Date.now(), lastPlanAt = 0, lastSnapshotAt = 0;
  let totalThreads = 0, planBudget = 0, shareThreads = 0, shareThreadsWanted = 0;
  const counters = { batches: 0, cancelled: 0, preps: 0, desyncs: 0 };
  let planSummary = "";

  // Adopt operations of a previous batcher instance (exact landing times in their args): those targets
  // drain first, since the operations that were still queued in the old instance are lost.
  for (const host of scanAll(ns).keys()) {
    for (const process of ns.ps(host)) {
      if (![HACK_WORKER, GROW_WORKER, WEAKEN_WORKER].includes(process.filename)) continue;
      const runtime = runtimeOf(String(process.args[0]));
      const landAt = Number(process.args[1]);
      runtime.running.push({ threads: process.threads, landAt });
      runtime.lastLandAt = Math.max(runtime.lastLandAt, landAt);
      runtime.mode = Mode.DRAIN;
    }
  }
  log("start", `on ${controllerHost}, spacing ${spacingMs} ms, share ${shareFraction}, adopted ${runtimes.size} draining targets`);

  /** @param {Operation} operation */
  const enqueue = (operation) => {
    let low = 0, high = queue.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (queue[middle].execAt <= operation.execAt) low = middle + 1; else high = middle;
    }
    queue.splice(low, 0, operation);
  };

  while (true) {
    const now = Date.now();
    const player = ns.getPlayer();

    // --- every PLAN_INTERVAL_MS: network, foreign jobs, share workers, plan ---
    if (now - lastPlanAt >= PLAN_INTERVAL_MS) {
      lastPlanAt = now;
      const hosts = [...scanAll(ns).keys()].filter((host) => host !== "home");
      portOpeners = countOpeners(ns);
      for (const host of hosts) tryRoot(ns, host, portOpeners);
      rootedHosts = hosts.filter((host) => ns.hasRootAccess(host));
      for (const host of rootedHosts) {
        if (host !== controllerHost && ns.getServerMaxRam(host) > 0) ns.scp([HACK_WORKER, GROW_WORKER, WEAKEN_WORKER, SHARE_WORKER], host, "home");
      }
      foreignTargets = new Set();
      shareThreads = 0;
      for (const host of [...rootedHosts, "home"]) {
        for (const process of ns.ps(host)) {
          if (CONTROLLER_WORKERS.includes(process.filename)) foreignTargets.add(String(process.args[0]));
          if (process.filename === SHARE_WORKER) shareThreads += process.threads;
        }
      }
    }

    // --- capacity ---
    const usableRam = (/** @type {string} */ host) => Math.max(0, ns.getServerMaxRam(host) - (host === "home" ? homeReserveGb : 0));
    const workerHosts = [...rootedHosts, "home"].filter((host) => usableRam(host) >= threadRam);
    /** @type {HostCapacity[]} */
    const capacity = workerHosts.map((host) => ({ host, freeThreads: Math.floor(Math.max(0, usableRam(host) - ns.getServerUsedRam(host)) / threadRam) }));
    const freeThreads = () => capacity.reduce((sum, host) => sum + host.freeThreads, 0);
    const totalRam = workerHosts.reduce((sum, host) => sum + usableRam(host), 0);
    totalThreads = Math.floor(totalRam / threadRam);
    shareThreadsWanted = Math.floor((shareFraction * totalRam) / shareThreadRam);
    planBudget = Math.floor(((totalRam - shareThreadsWanted * shareThreadRam) / threadRam) * PLAN_BUDGET_SHARE);

    // --- target states ---
    for (const [target, runtime] of runtimes) {
      runtime.running = runtime.running.filter((job) => job.landAt > now);
      runtime.batches = runtime.batches.filter((batch) => batch.endsAt > now);
      const settled = runtime.lastLandAt < now && runtime.running.length === 0;
      if ((runtime.mode === Mode.PREP || runtime.mode === Mode.DRAIN) && settled) runtime.mode = Mode.IDLE;
      if (runtime.mode === Mode.BATCH && !runtime.plan) runtime.mode = Mode.DRAIN;
      if (runtime.mode === Mode.BATCH && runtime.batches.length) {
        const maxFraction = Math.max(...runtime.batches.map((batch) => batch.hackFraction));
        const maxRaise = Math.max(...runtime.batches.map((batch) => batch.securityRaise));
        const money = ns.getServerMoneyAvailable(target), maxMoney = ns.getServerMaxMoney(target);
        const extraSecurity = ns.getServerSecurityLevel(target) - ns.getServerMinSecurityLevel(target);
        if (money < maxMoney * (1 - maxFraction) * 0.7 || extraSecurity > maxRaise * 1.5 + 0.5) {
          counters.desyncs++;
          log("desync", `${target}: money ${(100 * money / maxMoney).toFixed(0)}% (batches hack ${(100 * maxFraction).toFixed(0)}%), security +${extraSecurity.toFixed(2)} (allowed +${(maxRaise * 1.5 + 0.5).toFixed(2)}); draining`);
          for (const batch of runtime.batches) batch.cancelled = true;
          runtime.mode = Mode.DRAIN;
        }
      }
    }
    const isReady = (/** @type {string} */ target) => !foreignTargets.has(target)
      && ns.getServerSecurityLevel(target) <= ns.getServerMinSecurityLevel(target) + READY_MAX_EXTRA_SECURITY
      && ns.getServerMoneyAvailable(target) >= ns.getServerMaxMoney(target) * READY_MIN_MONEY;

    // --- plan ---
    if (lastPlanAt === now) {
      const level = player.skills.hacking;
      const prepGuessThreads = planBudget / 4;
      const optionsList = [];
      for (const host of rootedHosts) {
        if (onlyTarget && host !== onlyTarget) continue;
        if (ns.getServerMaxMoney(host) <= 0 || ns.getServerRequiredHackingLevel(host) > level) continue;
        const runtime = runtimeOf(host);
        const engaged = runtime.mode === Mode.BATCH || runtime.mode === Mode.PREP;
        if (!engaged && !isReady(host)) {
          const prep = prepShape(ns, ns.getServer(host), player, Infinity, GROW_MARGIN);
          if (Math.ceil(prepThreads(prep) / Math.max(1, prepGuessThreads)) * prep.weakenMs > MAX_PREP_MINUTES * 60_000) continue;
        }
        const options = targetOptions(ns, host, player, settings, engaged ? STICKY_PREFERENCE : 1);
        if (options) optionsList.push(options);
        preparedServers.set(host, preparedServer(ns, host));
      }
      const plans = planBatches(optionsList, planBudget);
      for (const [target, runtime] of runtimes) runtime.plan = plans.get(target) ?? null;
      for (const [target, plan] of plans) runtimeOf(target).plan = plan;
      const summary = [...plans.values()].map((plan) => `${plan.target} ${(100 * plan.shape.hackFraction).toFixed(0)}%`).join(", ");
      if (summary !== planSummary) {
        planSummary = summary;
        const moneyPerSecond = [...plans.values()].reduce((sum, plan) => sum + plan.moneyPerSecond, 0);
        log("plan", `${summary || "nothing"} | modelled $${ns.format.number(moneyPerSecond)}/s with ${planBudget} threads`);
      }
    }

    // --- planned, prepped, idle targets start batching ---
    for (const [target, runtime] of runtimes) {
      if (runtime.mode !== Mode.IDLE || !runtime.plan || !isReady(target)) continue;
      runtime.mode = Mode.BATCH;
      runtime.nextLandAt = Math.max(now + runtime.plan.shape.weakenMs + LEAD_MS + TICK_MS, runtime.lastLandAt + spacingMs);
      log("batch", `${target}: hack ${(100 * runtime.plan.shape.hackFraction).toFixed(1)}% x ${runtime.plan.batchesPerSecond.toFixed(2)}/s, ${Math.round(runtime.plan.threads)} threads`);
    }

    // --- new batches: each slot is scheduled when its first weaken is due ---
    for (const [target, runtime] of runtimes) {
      if (runtime.mode !== Mode.BATCH || !runtime.plan) continue;
      const shape = runtime.plan.shape;
      const intervalMs = Math.max(4 * spacingMs, 1000 / runtime.plan.batchesPerSecond);
      while (runtime.nextLandAt - shape.weakenMs - LEAD_MS <= now + TICK_MS) {
        // Behind schedule (stall, level-up shortened nothing yet): skip the missed slots.
        if (runtime.nextLandAt - shape.weakenMs - LEAD_MS < now) runtime.nextLandAt = Math.max(now + shape.weakenMs + LEAD_MS, runtime.lastLandAt + spacingMs);
        const landAt = runtime.nextLandAt;
        /** @type {Batch} */
        const batch = { id: nextBatchId++, target, cancelled: false, hackFraction: shape.hackFraction, securityRaise: shape.securityRaise, endsAt: landAt + 3 * spacingMs };
        enqueue({ script: WEAKEN_WORKER, execAt: landAt + spacingMs - shape.weakenMs - LEAD_MS, landAt: landAt + spacingMs, threads: shape.weaken1Threads, batch });
        enqueue({ script: WEAKEN_WORKER, execAt: landAt + 3 * spacingMs - shape.weakenMs - LEAD_MS, landAt: landAt + 3 * spacingMs, threads: shape.weaken2Threads, batch });
        enqueue({ script: GROW_WORKER, execAt: landAt + 2 * spacingMs - shape.growMs - LEAD_MS, landAt: landAt + 2 * spacingMs, threads: shape.growThreads, batch });
        enqueue({ script: HACK_WORKER, execAt: landAt - shape.hackMs - LEAD_MS, landAt, threads: shape.hackThreads, batch });
        runtime.batches.push(batch);
        runtime.lastLandAt = batch.endsAt;
        runtime.nextLandAt = landAt + intervalMs;
        counters.batches++;
      }
    }

    // --- prep: RAM not reserved by running batches (nor queued prep grows) ---
    const runningThreads = (/** @type {TargetRuntime} */ runtime) => runtime.running.reduce((sum, job) => sum + job.threads, 0);
    let reserved = queue.filter((operation) => !operation.batch.cancelled && operation.batch.hackFraction === 0).reduce((sum, operation) => sum + operation.threads, 0);
    let reservedForUnpreppedPlans = 0;
    for (const runtime of runtimes.values()) {
      if (runtime.mode === Mode.BATCH && runtime.plan) reserved += Math.max(0, runtime.plan.threads - runningThreads(runtime));
      else if (runtime.plan) reservedForUnpreppedPlans += Math.max(0, runtime.plan.threads - runningThreads(runtime));
    }
    // Planned targets first (best plan first), then the next-best unplanned ones with what no plan claims.
    const prepCandidates = [...runtimes.entries()]
      .filter(([target, runtime]) => runtime.mode === Mode.IDLE && !foreignTargets.has(target) && !isReady(target)
        && (runtime.plan || preparedServers.has(target)))
      .sort(([, a], [, b]) => (b.plan?.moneyPerSecond ?? -1) - (a.plan?.moneyPerSecond ?? -1));
    for (const [target, runtime] of prepCandidates) {
      const available = freeThreads() - reserved - (runtime.plan ? 0 : reservedForUnpreppedPlans);
      if (available < 10) break;
      const prep = prepShape(ns, ns.getServer(target), player, available, GROW_MARGIN);
      if (prepThreads(prep) === 0) continue;
      const landAt = now + prep.weakenMs + LEAD_MS;
      /** @type {Batch} */
      const batch = { id: nextBatchId++, target, cancelled: false, hackFraction: 0, securityRaise: 0, endsAt: landAt + 2 * spacingMs };
      if (prep.weaken1Threads) enqueue({ script: WEAKEN_WORKER, execAt: now, landAt, threads: prep.weaken1Threads, batch });
      if (prep.growThreads) {
        enqueue({ script: WEAKEN_WORKER, execAt: now, landAt: landAt + 2 * spacingMs, threads: prep.weaken2Threads, batch });
        enqueue({ script: GROW_WORKER, execAt: landAt + spacingMs - prep.growMs - LEAD_MS, landAt: landAt + spacingMs, threads: prep.growThreads, batch });
      }
      reserved += prepThreads(prep); // not exec'd yet: the next candidate must not count these threads as free
      runtime.mode = Mode.PREP;
      runtime.lastLandAt = batch.endsAt;
      counters.preps++;
      log("prep", `${target}${runtime.plan ? "" : " (next)"}: weaken ${prep.weaken1Threads} grow ${prep.growThreads} weaken ${prep.weaken2Threads}, ${(prep.weakenMs / 60000).toFixed(1)} min`);
    }

    // --- execute due operations ---
    let due = 0;
    while (due < queue.length && queue[due].execAt <= now) due++;
    for (const operation of queue.splice(0, due)) {
      const batch = operation.batch;
      if (batch.cancelled) continue;
      let threads = operation.threads;
      if (operation.script === HACK_WORKER) {
        // Re-sized for the current level: a level-up since the batch was planned raises hack percent.
        const server = preparedServers.get(batch.target);
        const perThread = server ? ns.formulas.hacking.hackPercent(server, player) : 0;
        if (perThread > 0) threads = Math.min(threads, Math.floor(batch.hackFraction / perThread + 1e-9));
        if (threads < 1) continue;
      }
      const started = startThreads(ns, capacity, operation.script, threads, [batch.target, operation.landAt, batch.id]);
      if (started > 0) runtimeOf(batch.target).running.push({ threads: started, landAt: operation.landAt });
      if (started < threads && operation.script !== HACK_WORKER) {
        batch.cancelled = true;
        counters.cancelled++;
      }
    }

    // --- share workers (with the plan): top up from RAM nothing has reserved, or trim ---
    if (lastPlanAt === now) {
      for (const host of workerHosts) {
        if (shareThreads <= shareThreadsWanted) break;
        const onHost = ns.ps(host).filter((process) => process.filename === SHARE_WORKER).reduce((sum, process) => sum + process.threads, 0);
        if (onHost > 0 && ns.scriptKill(SHARE_WORKER, host)) shareThreads -= onHost;
      }
      let shareRamBudget = Math.max(0, (freeThreads() - reserved - reservedForUnpreppedPlans) * threadRam);
      for (const host of [...capacity].sort((a, b) => b.freeThreads - a.freeThreads)) {
        if (shareThreads >= shareThreadsWanted) break;
        const toStart = Math.min(shareThreadsWanted - shareThreads, Math.floor(Math.min(host.freeThreads * threadRam, shareRamBudget) / shareThreadRam));
        if (toStart > 0 && ns.exec(SHARE_WORKER, host.host, toStart)) {
          shareThreads += toStart;
          shareRamBudget -= toStart * shareThreadRam;
        }
      }
    }

    // --- metrics target and snapshot ---
    if (now - lastSnapshotAt >= 5000) {
      lastSnapshotAt = now;
      const planned = [...runtimes.entries()].filter(([, runtime]) => runtime.plan)
        .sort(([, a], [, b]) => (b.plan?.moneyPerSecond ?? 0) - (a.plan?.moneyPerSecond ?? 0));
      const metricsTarget = planned.find(([, runtime]) => runtime.mode === Mode.BATCH)?.[0] ?? planned[0]?.[0] ?? "";
      if (metricsTarget && String(ns.peek(TARGET_PORT)) !== metricsTarget) {
        ns.clearPort(TARGET_PORT);
        ns.writePort(TARGET_PORT, metricsTarget);
      }
      const plannedThreads = planned.reduce((sum, [, runtime]) => sum + (runtime.plan?.threads ?? 0), 0);
      const snapshot = {
        time: now,
        hacking: player.skills.hacking,
        money: player.money,
        portOpeners,
        // free = threads no plan can use: server-buyer only buys RAM when that is below 10%.
        threads: { total: totalThreads, free: Math.max(0, Math.round(planBudget - plannedThreads)), reserved: Math.round(reserved), idleNow: freeThreads(), budget: planBudget },
        share: { threads: shareThreads, wanted: shareThreadsWanted, power: ns.getSharePower() },
        queued: queue.length,
        counters,
        targets: [...runtimes.entries()].filter(([, runtime]) => runtime.plan || runtime.mode !== Mode.IDLE).map(([target, runtime]) => ({
          target,
          mode: runtime.mode,
          hackFraction: +(runtime.plan?.shape.hackFraction ?? 0).toFixed(3),
          batchesPerSecond: +(runtime.plan?.batchesPerSecond ?? 0).toFixed(2),
          plannedThreads: Math.round(runtime.plan?.threads ?? 0),
          runningThreads: runningThreads(runtime),
          modelledMoneyPerSecond: Math.round(runtime.plan?.moneyPerSecond ?? 0),
          moneyPercent: Math.round((100 * ns.getServerMoneyAvailable(target)) / ns.getServerMaxMoney(target)),
          extraSecurity: +(ns.getServerSecurityLevel(target) - ns.getServerMinSecurityLevel(target)).toFixed(2),
        })),
      };
      ns.write(STATE_FILE, JSON.stringify(snapshot), "w");
      if (controllerHost !== "home") ns.scp([STATE_FILE, LOG_FILE], "home", controllerHost);
    }

    await ns.sleep(TICK_MS);
  }
}

/**
 * Starts threads of a worker: on the smallest host that fits them all (fewer, larger processes),
 * else spread from the largest free host down. Returns the threads started.
 * @param {NS} ns @param {HostCapacity[]} capacity @param {string} script @param {number} threads @param {(string|number)[]} args
 */
function startThreads(ns, capacity, script, threads, args) {
  if (capacity.reduce((sum, host) => sum + host.freeThreads, 0) < threads) return 0;
  let single = null;
  for (const host of capacity) if (host.freeThreads >= threads && (!single || host.freeThreads < single.freeThreads)) single = host;
  if (single && ns.exec(script, single.host, threads, ...args)) {
    single.freeThreads -= threads;
    return threads;
  }
  let started = 0;
  for (const host of [...capacity].sort((a, b) => b.freeThreads - a.freeThreads)) {
    if (started >= threads) break;
    const count = Math.min(host.freeThreads, threads - started);
    if (count < 1) break;
    if (ns.exec(script, host.host, count, ...args)) {
      host.freeThreads -= count;
      started += count;
    }
  }
  return started;
}
