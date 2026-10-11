import { scanAll } from "lib/net.js";
import { countOpeners, tryRoot } from "lib/targets.js";
import { TARGET_PORT } from "w/hgw.js";

const H = "w/h.js", G = "w/g.js", W = "w/w.js";
const STATE = "data/state.txt";
const HACK_SEC = 0.002, GROW_SEC = 0.004, WEAKEN_SEC = 0.05;
const P_MAX = 0.25;          // max fraction stolen per cycle: small bites are cheaper per thread
const P_SCORE = 0.1;         // fraction used to rank targets
const PREP_MAX_MIN = 60;     // don't start preps estimated to take longer than this

// Multi-target controller. Each target runs its own cycle (one job per weaken time):
//   1. prepped targets get hack jobs first, best modelled $/s per thread slot first
//   2. remaining RAM (minus a reservation, so busy hack targets find their RAM again)
//      preps unprepped targets in score order: the best takes all it can use, the next
//      the rest. Prep grow is delayed to land just after the first weaken, at min security.
// Runs on a rooted server; never uses home RAM (reserved for agent one-shots).
// args: [only target] to restrict to a single target (for experiments)
/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  const self = ns.getHostname();
  const slot = Math.max(ns.getScriptRam(H, "home"), ns.getScriptRam(G, "home"), ns.getScriptRam(W, "home"));
  const only = ns.args[0] ? String(ns.args[0]) : "";

  // Take over from the old daemon's workers.
  for (const h of scanAll(ns).keys()) if (h !== "home") ns.scriptKill("w/hgw.js", h);

  /** @type {Map<string, {busyUntil: number, kind: string, threads: number, p: number}>} */
  const recs = new Map();
  /** @type {string[]} */
  let rooted = [];
  let openers = 0;
  let nonce = 0;

  for (let tick = 0; ; tick++) {
    if (tick % 10 === 0) {
      const hosts = [...scanAll(ns).keys()].filter((h) => h !== "home");
      openers = countOpeners(ns);
      for (const h of hosts) tryRoot(ns, h, openers);
      rooted = hosts.filter((h) => ns.hasRootAccess(h));
      for (const h of rooted) if (h !== self && ns.getServerMaxRam(h) > 0) ns.scp([H, G, W], h, "home");
    }

    const now = Date.now();
    const lvl = ns.getHackingLevel();
    const free = rooted.map((h) => ({ h, n: Math.floor((ns.getServerMaxRam(h) - ns.getServerUsedRam(h)) / slot) }));
    const totalSlots = rooted.reduce((s, h) => s + Math.floor(ns.getServerMaxRam(h) / slot), 0);
    const left = () => free.reduce((s, f) => s + f.n, 0);

    const targets = rooted
      .filter((h) => (!only || h === only) && ns.getServerMaxMoney(h) > 0 && ns.getServerRequiredHackingLevel(h) <= lvl)
      .map((h) => ({ h, score: score(ns, h, lvl) }))
      .sort((a, b) => b.score - a.score);
    const rec = (/** @type {string} */ h) => {
      if (!recs.has(h)) recs.set(h, { busyUntil: 0, kind: "new", threads: 0, p: 0 });
      return /** @type {{busyUntil: number, kind: string, threads: number, p: number}} */ (recs.get(h));
    };
    const launch = (/** @type {string} */ h, /** @type {Job} */ job) => {
      const id = nonce++;
      const tw = ns.getWeakenTime(h);
      // Prep: grow lands 100 ms after the first weaken (min security), second weaken 100 ms later.
      const growDelay = job.kind === "prep" && job.w1 > 0 ? Math.max(0, tw - ns.getGrowTime(h) + 100) : 0;
      const n = run(ns, free, W, job.w1, h, id, 0) + run(ns, free, H, job.h, h, id, 0)
        + run(ns, free, G, job.g, h, id, growDelay) + run(ns, free, W, job.w2, h, id, 200);
      Object.assign(rec(h), { busyUntil: now + tw + 500, kind: job.kind, threads: n, p: job.p });
      ns.print(`${job.kind} ${h}: h=${job.h} g=${job.g} w=${job.w1}+${job.w2} p=${job.p.toFixed(3)}`);
    };

    // 1. hack jobs on prepped targets
    for (const { h } of targets) {
      const r = rec(h);
      if (r.busyUntil > now || !isPrepped(ns, h)) continue;
      const job = planHack(ns, h, left());
      if (job.h > 0) launch(h, job);
      else r.kind = "starved";
    }

    // 2. prep in score order with what's left, minus the RAM busy hack targets will want back.
    // Conservative: reserves each busy hack job's full size, although part of it is still in use.
    const reserved = [...recs.values()].filter((r) => r.kind === "hack" && r.busyUntil > now).reduce((s, r) => s + r.threads, 0);
    const cap = Math.max(1, totalSlots - reserved);
    for (const { h } of targets) {
      if (left() - reserved <= 0) break;
      if (rec(h).busyUntil > now || isPrepped(ns, h) || prepMinutes(ns, h, cap) > PREP_MAX_MIN) continue;
      const job = planPrep(ns, h, left() - reserved);
      if (job.g + job.w1 + job.w2 > 0) launch(h, job);
    }
    const prepping = targets.filter((t) => rec(t.h).kind === "prep" && rec(t.h).busyUntil > now).map((t) => t.h);

    // Metrics sampler follows the best prepped target.
    const top = targets.find((t) => rec(t.h).kind === "hack")?.h ?? targets[0]?.h ?? "";
    if (top && String(ns.peek(TARGET_PORT)) !== top) {
      ns.clearPort(TARGET_PORT);
      ns.writePort(TARGET_PORT, top);
    }

    if (tick % 5 === 0) {
      const state = {
        time: now,
        hacking: lvl,
        money: ns.getServerMoneyAvailable("home"),
        openers,
        slots: { total: totalSlots, free: left(), reserved },
        prepping,
        targets: targets.slice(0, 8).map(({ h, score }) => {
          const r = rec(h);
          return { h, score: Math.round(score), kind: r.kind, p: r.p, threads: r.threads, inSec: Math.max(0, Math.round((r.busyUntil - now) / 1000)) };
        }),
      };
      ns.write(STATE, JSON.stringify(state), "w");
      if (self !== "home") ns.scp(STATE, "home", self);
    }

    await ns.sleep(1000);
  }
}

/** @param {NS} ns @param {string} t */
function isPrepped(ns, t) {
  return ns.getServerSecurityLevel(t) <= ns.getServerMinSecurityLevel(t) + 0.5
    && ns.getServerMoneyAvailable(t) >= ns.getServerMaxMoney(t) * 0.99;
}

// Grow threads for a money multiplier (game formula, from memory: rate capped at 1.0035).
/** @param {number} mult @param {number} sec @param {number} growth */
function growThreads(mult, sec, growth) {
  return Math.log(mult) / Math.log(Math.min(1.0035, 1 + 0.03 / sec)) / (growth / 100);
}

// Modelled steady-state $/s per thread slot at min security, hacking P_SCORE per cycle.
/** @param {NS} ns @param {string} t @param {number} lvl */
function score(ns, t, lvl) {
  const req = ns.getServerRequiredHackingLevel(t), sec = ns.getServerMinSecurityLevel(t);
  const max = ns.getServerMaxMoney(t), growth = ns.getServerGrowth(t);
  const chance = Math.min(1, Math.max(0, ((1.75 * lvl - req) / (1.75 * lvl)) * ((100 - sec) / 100)));
  const pct = ((100 - sec) / 100) * ((lvl - (req - 1)) / lvl) / 240;
  if (pct <= 0 || chance <= 0) return 0;
  const tw = (4 * 5 * (2.5 * req * sec + 500)) / (lvl + 50);
  const h = P_SCORE / pct, g = growThreads(1 / (1 - P_SCORE), sec, growth) * 1.05;
  const w = (h * HACK_SEC + g * GROW_SEC) / WEAKEN_SEC;
  return (P_SCORE * max * chance) / tw / (h + g + w);
}

// Estimated minutes to prep t using cap thread slots per weaken cycle.
/** @param {NS} ns @param {string} t @param {number} cap */
function prepMinutes(ns, t, cap) {
  const sec = ns.getServerSecurityLevel(t), min = ns.getServerMinSecurityLevel(t);
  const money = Math.max(1, ns.getServerMoneyAvailable(t)), max = ns.getServerMaxMoney(t);
  const g = growThreads(max / money, min + 2, ns.getServerGrowth(t));
  const threads = g * (1 + GROW_SEC / WEAKEN_SEC) + (sec - min) / WEAKEN_SEC;
  return (Math.ceil(threads / cap) * ns.getWeakenTime(t)) / 60000;
}

/** @param {NS} ns @param {string} t @param {number} capacity @returns {Job} */
function planPrep(ns, t, capacity) {
  const sec = ns.getServerSecurityLevel(t), min = ns.getServerMinSecurityLevel(t);
  const money = ns.getServerMoneyAvailable(t), max = ns.getServerMaxMoney(t);
  const w1 = Math.min(capacity, Math.ceil((sec - min) / WEAKEN_SEC));
  let g = money < max ? Math.ceil(ns.growthAnalyze(t, max / Math.max(money, 1))) : 0;
  g = Math.max(0, Math.min(g, Math.floor((capacity - w1) / (1 + GROW_SEC / WEAKEN_SEC))));
  const w2 = Math.ceil((g * GROW_SEC) / WEAKEN_SEC);
  return { kind: "prep", p: 0, h: 0, g, w1, w2 };
}

// Largest hack (p <= P_MAX) whose H/G/W threads fit capacity. Target must be prepped.
/** @param {NS} ns @param {string} t @param {number} capacity @returns {Job} */
function planHack(ns, t, capacity) {
  const perThread = ns.hackAnalyze(t);
  const cost = (/** @type {number} */ h) => {
    const p = Math.min(h * perThread, 0.95);
    const g = Math.ceil(ns.growthAnalyze(t, 1 / (1 - p)) * 1.05); // margin: grow lands at raised security
    const w = Math.ceil((h * HACK_SEC + g * GROW_SEC) / WEAKEN_SEC) + 1;
    return { kind: "hack", p, h, g, w1: w, w2: 0 };
  };
  let lo = 0, hi = Math.max(1, Math.floor(P_MAX / perThread));
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const c = cost(mid);
    if (c.h + c.g + c.w1 <= capacity) lo = mid; else hi = mid - 1;
  }
  return lo > 0 ? cost(lo) : { kind: "hack", p: 0, h: 0, g: 0, w1: 0, w2: 0 };
}

/** @typedef {{kind: string, p: number, h: number, g: number, w1: number, w2: number}} Job */

/**
 * Spread threads of script over hosts; returns threads actually started.
 * @param {NS} ns @param {{h: string, n: number}[]} free @param {string} script
 * @param {number} threads @param {string} target @param {number} nonce @param {number} delay
 */
function run(ns, free, script, threads, target, nonce, delay) {
  let started = 0;
  for (const f of free) {
    if (started >= threads) break;
    const n = Math.min(f.n, threads - started);
    if (n < 1) continue;
    if (ns.exec(script, f.h, n, target, nonce, delay)) {
      f.n -= n;
      started += n;
    }
  }
  return started;
}
