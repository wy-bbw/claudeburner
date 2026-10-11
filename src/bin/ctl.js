import { scanAll } from "lib/net.js";
import { countOpeners, tryRoot } from "lib/targets.js";
import { TARGET_PORT } from "w/hgw.js";

const H = "w/h.js", G = "w/g.js", W = "w/w.js", SHARE = "w/share.js";
const STATE = "data/state.txt";
const HACK_SEC = 0.002, GROW_SEC = 0.004, WEAKEN_SEC = 0.05;
const P_MAX = 0.25;          // max fraction stolen per cycle: small bites are cheaper per thread
const P_SCORE = 0.1;         // fraction used to rank targets
const PREP_MAX_MIN = 60;     // don't start preps estimated to take longer than this
const HACK_KEEP_MONEY = 0.5; // a hack-mode target stays in hack mode above this money fraction...
const HACK_KEEP_SEC = 5;     // ...and below min security + this

/** @typedef {{kind: string, p: number, h: number, g: number, w1: number, w2: number}} Job */
/** @typedef {{until: number, g: number, w1: number, w1Lands: number}} Flight */
/** @typedef {{mode: string, busyUntil: number, threads: number, p: number, flights: Flight[]}} Rec */

// Multi-target controller.
//   Targets are in "prep" mode until min security / max money, then in "hack" mode, where
//   they stay while money >= 50% and security <= min+5 (each hack job also repairs drift).
//   1. hack-mode targets: one job per weaken time, best modelled $/s per thread slot first
//   1b. share workers topped up to --rep of all RAM (faction rep boost), out of prep's share
//   2. prep-mode targets in score order with what's left (minus a reservation so busy hack
//      targets find their RAM again). Prep jobs stack: only threads not already in flight are
//      added, so the best target gets everything it needs first. Grow lands after the weakens.
// Runs on a rooted server; never uses home RAM (reserved for agent one-shots).
// flags: --only <target> (experiments), --rep <fraction of RAM for share workers, default 0.25>
/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  const self = ns.getHostname();
  const slot = Math.max(ns.getScriptRam(H, "home"), ns.getScriptRam(G, "home"), ns.getScriptRam(W, "home"));
  const shareRam = ns.getScriptRam(SHARE, "home");
  // Not "--share": the RAM calculator would bill `flags.share` as ns.share() (2.4 GB).
  const flags = ns.flags([["only", ""], ["rep", 0.25]]);
  const only = String(flags.only);
  const shareFraction = Number(flags.rep);

  // Take over from the old daemon's workers.
  for (const h of scanAll(ns).keys()) if (h !== "home") ns.scriptKill("w/hgw.js", h);

  /** @type {Map<string, Rec>} */
  const recs = new Map();
  const rec = (/** @type {string} */ h) => {
    if (!recs.has(h)) recs.set(h, { mode: "prep", busyUntil: 0, threads: 0, p: 0, flights: [] });
    return /** @type {Rec} */ (recs.get(h));
  };
  // Adopt jobs still running from a previous controller as prep flights (upper-bound timing),
  // so a restart doesn't launch them twice.
  for (const host of scanAll(ns).keys()) {
    for (const p of ns.ps(host)) {
      if (p.filename !== G && p.filename !== W) continue;
      const t = String(p.args[0]);
      const until = Date.now() + ns.getWeakenTime(t) + 500;
      rec(t).flights.push({ until, g: p.filename === G ? p.threads : 0, w1: p.filename === W ? p.threads : 0, w1Lands: until });
    }
  }

  /** @type {string[]} */
  let rooted = [];
  let openers = 0;
  let nonce = Date.now(); // unique across restarts, so job args never collide with adopted ones

  for (let tick = 0; ; tick++) {
    if (tick % 10 === 0) {
      const hosts = [...scanAll(ns).keys()].filter((h) => h !== "home");
      openers = countOpeners(ns);
      for (const h of hosts) tryRoot(ns, h, openers);
      rooted = hosts.filter((h) => ns.hasRootAccess(h));
      for (const h of rooted) if (h !== self && ns.getServerMaxRam(h) > 0) ns.scp([H, G, W, SHARE], h, "home");
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

    for (const { h } of targets) {
      const r = rec(h);
      r.flights = r.flights.filter((f) => f.until > now);
      const money = ns.getServerMoneyAvailable(h) / ns.getServerMaxMoney(h);
      const secOver = ns.getServerSecurityLevel(h) - ns.getServerMinSecurityLevel(h);
      if (r.mode === "hack" && (money < HACK_KEEP_MONEY || secOver > HACK_KEEP_SEC)) r.mode = "prep";
      else if (r.mode === "prep" && r.flights.length === 0 && money >= 0.99 && secOver <= 0.5) r.mode = "hack";
    }

    /** @param {string} h @param {Job} job */
    const launch = (h, job) => {
      const r = rec(h), id = nonce++;
      const tw = ns.getWeakenTime(h), tg = ns.getGrowTime(h);
      let n;
      if (job.kind === "prep") {
        // Grow lands 100 ms after the last weaken already in flight (or this job's own w1), at min security.
        const w1Lands = Math.max(job.w1 > 0 ? now + tw : 0, ...r.flights.map((f) => f.w1Lands), now);
        const growLands = Math.max(w1Lands, now + tg) + 100;
        const w1 = run(ns, free, W, job.w1, h, id, 0);
        const g = run(ns, free, G, job.g, h, id, growLands - now - tg);
        const w2 = run(ns, free, W, job.w2, h, id, Math.max(0, growLands + 100 - now - tw));
        r.flights.push({ until: Math.max(now + tw, growLands + 100) + 300, g, w1, w1Lands: job.w1 > 0 ? now + tw : 0 });
        n = w1 + g + w2;
      } else {
        n = run(ns, free, H, job.h, h, id, 0) + run(ns, free, G, job.g, h, id, 0) + run(ns, free, W, job.w1, h, id, 0);
        Object.assign(r, { busyUntil: now + tw + 500, threads: n, p: job.p });
      }
      ns.print(`${job.kind} ${h}: h=${job.h} g=${job.g} w=${job.w1}+${job.w2} p=${job.p.toFixed(3)} started=${n}`);
    };

    // 1. hack-mode targets
    for (const { h } of targets) {
      const r = rec(h);
      if (r.mode !== "hack" || r.busyUntil > now) continue;
      const job = planHack(ns, h, left());
      if (job.h + job.g + job.w1 > 0) launch(h, job);
    }

    // 1b. top up share workers, then refresh the slot view for prep
    const totalRam = rooted.reduce((s, h) => s + ns.getServerMaxRam(h), 0);
    const shareTarget = Math.floor((shareFraction * totalRam) / shareRam);
    let shareThreads = rooted.reduce((s, h) => s + ns.ps(h).filter((p) => p.filename === SHARE).reduce((t, p) => t + p.threads, 0), 0);
    for (const h of rooted) {
      if (shareThreads >= shareTarget) break;
      const n = Math.min(shareTarget - shareThreads, Math.floor((ns.getServerMaxRam(h) - ns.getServerUsedRam(h)) / shareRam));
      if (n > 0 && ns.exec(SHARE, h, n)) shareThreads += n;
    }
    for (const f of free) f.n = Math.floor((ns.getServerMaxRam(f.h) - ns.getServerUsedRam(f.h)) / slot);

    // 2. prep-mode targets in score order, minus the RAM busy hack targets will want back.
    // Conservative: reserves each busy hack job's full size, although part of it is still in use.
    const reserved = [...recs.values()].filter((r) => r.mode === "hack" && r.busyUntil > now).reduce((s, r) => s + r.threads, 0);
    const cap = Math.max(1, totalSlots - reserved);
    for (const { h } of targets) {
      if (left() - reserved <= 0) break;
      const r = rec(h);
      if (r.mode !== "prep" || prepMinutes(ns, h, cap) > PREP_MAX_MIN) continue;
      const job = planPrep(ns, h, left() - reserved, r.flights);
      if (job.g + job.w1 + job.w2 > 0) launch(h, job);
    }

    // Metrics sampler follows the best hack-mode target.
    const top = targets.find((t) => rec(t.h).mode === "hack")?.h ?? targets[0]?.h ?? "";
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
        share: { threads: shareThreads, target: shareTarget, power: ns.getSharePower() },
        targets: targets.slice(0, 12).map(({ h, score }) => {
          const r = rec(h);
          return {
            h,
            score: Math.round(score),
            mode: r.mode,
            money: Math.round((100 * ns.getServerMoneyAvailable(h)) / ns.getServerMaxMoney(h)),
            secOver: +(ns.getServerSecurityLevel(h) - ns.getServerMinSecurityLevel(h)).toFixed(1),
            p: +r.p.toFixed(3),
            flights: r.flights.length,
            inflightG: r.flights.reduce((s, f) => s + f.g, 0),
          };
        }),
      };
      ns.write(STATE, JSON.stringify(state), "w");
      if (self !== "home") ns.scp(STATE, "home", self);
    }

    await ns.sleep(1000);
  }
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

// Grow threads needed to reach max money, assuming the grow lands at min security.
/** @param {NS} ns @param {string} t @param {number} fromMoney */
function growToMax(ns, t, fromMoney) {
  const max = ns.getServerMaxMoney(t);
  if (fromMoney >= max) return 0;
  const min = ns.getServerMinSecurityLevel(t);
  // growthAnalyze uses current security; when we're above min, use the model at min instead.
  if (ns.getServerSecurityLevel(t) > min + 1) return Math.ceil(growThreads(max / Math.max(fromMoney, 1), min, ns.getServerGrowth(t)));
  return Math.ceil(ns.growthAnalyze(t, max / Math.max(fromMoney, 1)));
}

// Estimated minutes to prep t using cap thread slots per weaken cycle.
/** @param {NS} ns @param {string} t @param {number} cap */
function prepMinutes(ns, t, cap) {
  const secOver = ns.getServerSecurityLevel(t) - ns.getServerMinSecurityLevel(t);
  const threads = growToMax(ns, t, ns.getServerMoneyAvailable(t)) * (1 + GROW_SEC / WEAKEN_SEC) + secOver / WEAKEN_SEC;
  return (Math.ceil(threads / cap) * ns.getWeakenTime(t)) / 60000;
}

// Prep threads still needed beyond what's in flight, within capacity.
/** @param {NS} ns @param {string} t @param {number} capacity @param {Flight[]} flights @returns {Job} */
function planPrep(ns, t, capacity, flights) {
  const secOver = ns.getServerSecurityLevel(t) - ns.getServerMinSecurityLevel(t);
  const w1 = Math.max(0, Math.min(capacity, Math.ceil(secOver / WEAKEN_SEC) - flights.reduce((s, f) => s + f.w1, 0)));
  const gNeed = growToMax(ns, t, ns.getServerMoneyAvailable(t)) - flights.reduce((s, f) => s + f.g, 0);
  const g = Math.max(0, Math.min(gNeed, Math.floor((capacity - w1) / (1 + GROW_SEC / WEAKEN_SEC))));
  const w2 = Math.ceil((g * GROW_SEC) / WEAKEN_SEC);
  return { kind: "prep", p: 0, h: 0, g, w1, w2 };
}

// Largest hack (p <= P_MAX) whose threads fit capacity; grow and weaken also repair any
// drift (money below max, security above min) so a hack-mode target stays healthy.
/** @param {NS} ns @param {string} t @param {number} capacity @returns {Job} */
function planHack(ns, t, capacity) {
  const money = ns.getServerMoneyAvailable(t);
  const secOver = ns.getServerSecurityLevel(t) - ns.getServerMinSecurityLevel(t);
  const perThread = ns.hackAnalyze(t);
  const cost = (/** @type {number} */ h) => {
    const p = Math.min(h * perThread, 0.95);
    const g = Math.ceil(growToMax(ns, t, money * (1 - p)) * 1.05); // margin: grow lands at raised security
    const w = Math.ceil(secOver / WEAKEN_SEC + (h * HACK_SEC + g * GROW_SEC) / WEAKEN_SEC) + 1;
    return { kind: "hack", p, h, g, w1: w, w2: 0 };
  };
  let lo = 0, hi = Math.max(1, Math.floor(P_MAX / perThread));
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const c = cost(mid);
    if (c.h + c.g + c.w1 <= capacity) lo = mid; else hi = mid - 1;
  }
  const job = cost(lo);
  if (job.g + job.w1 > capacity) { // can't even repair fully: repair what fits
    job.w1 = Math.min(job.w1, capacity);
    job.g = Math.max(0, Math.min(job.g, capacity - job.w1));
  }
  return job;
}

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
    if (ns.exec(script, f.h, n, target, nonce, Math.max(0, Math.round(delay)))) {
      f.n -= n;
      started += n;
    }
  }
  return started;
}
