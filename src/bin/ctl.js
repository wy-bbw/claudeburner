import { scanAll } from "lib/net.js";
import { countOpeners, tryRoot, pickTarget } from "lib/targets.js";
import { TARGET_PORT } from "w/hgw.js";

const H = "w/h.js", G = "w/g.js", W = "w/w.js";
const STATE = "data/state.txt";
const HACK_SEC = 0.002, GROW_SEC = 0.004, WEAKEN_SEC = 0.05;

// Coordinated controller, replaces bin/daemon.js + w/hgw.js.
// One job per weaken-time cycle, all threads start together (no ms timing yet):
//   prep:  weaken to min security, grow to max money (+ weaken for the grow)
//   hack:  largest hack fraction p whose H/G/W thread counts fit free RAM,
//          so the server ends each cycle back at min security / max money.
// Runs on a rooted server; never uses home RAM (reserved for agent one-shots).
/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  const self = ns.getHostname();
  const ram = { [H]: ns.getScriptRam(H, "home"), [G]: ns.getScriptRam(G, "home"), [W]: ns.getScriptRam(W, "home") };
  const slot = Math.max(ram[H], ram[G], ram[W]);

  // Take over from the old daemon's workers.
  for (const h of scanAll(ns).keys()) if (h !== "home") ns.scriptKill("w/hgw.js", h);

  let target = "";
  let cycle = 0;
  while (true) {
    const hosts = [...scanAll(ns).keys()].filter((h) => h !== "home");
    const openers = countOpeners(ns);
    for (const h of hosts) tryRoot(ns, h, openers);
    const rooted = hosts.filter((h) => ns.hasRootAccess(h) && ns.getServerMaxRam(h) > 0);
    for (const h of rooted) if (h !== self) ns.scp([H, G, W], h, "home");

    const best = pickTarget(ns, rooted);
    if (best && best !== target) {
      target = best;
      ns.clearPort(TARGET_PORT);
      ns.writePort(TARGET_PORT, target);
      ns.print(`target -> ${target}`);
    }

    const free = rooted.map((h) => ({ h, n: Math.floor((ns.getServerMaxRam(h) - ns.getServerUsedRam(h)) / slot) }));
    const capacity = free.reduce((s, f) => s + f.n, 0);
    const job = plan(ns, target, capacity);
    const nonce = cycle++;
    const launched = { h: run(ns, free, H, job.h, target, nonce), g: run(ns, free, G, job.g, target, nonce), w: run(ns, free, W, job.w, target, nonce) };
    const wait = ns.getWeakenTime(target) + 200;

    ns.print(`${job.kind} ${target}: h=${launched.h} g=${launched.g} w=${launched.w} p=${job.p.toFixed(3)} of ${capacity} slots, ${(wait / 1000).toFixed(0)}s`);
    const state = {
      time: Date.now(),
      hacking: ns.getHackingLevel(),
      money: ns.getServerMoneyAvailable("home"),
      openers,
      target,
      job: { ...job, launched, capacity, waitMs: wait },
      rooted: rooted.map((h) => ({ host: h, ram: ns.getServerMaxRam(h), used: ns.getServerUsedRam(h) })),
    };
    ns.write(STATE, JSON.stringify(state), "w");
    if (self !== "home") ns.scp(STATE, "home", self);

    await ns.sleep(wait);
  }
}

/**
 * Thread counts for one cycle against target, within capacity thread slots.
 * @param {NS} ns @param {string} t @param {number} capacity
 */
function plan(ns, t, capacity) {
  const sec = ns.getServerSecurityLevel(t), min = ns.getServerMinSecurityLevel(t);
  const money = ns.getServerMoneyAvailable(t), max = ns.getServerMaxMoney(t);

  if (sec > min + 0.5 || money < max * 0.99) {
    const w1 = Math.min(capacity, Math.ceil((sec - min) / WEAKEN_SEC));
    let g = money < max ? Math.ceil(ns.growthAnalyze(t, max / Math.max(money, 1))) : 0;
    g = Math.min(g, Math.floor((capacity - w1) / (1 + GROW_SEC / WEAKEN_SEC)));
    const w2 = Math.ceil((g * GROW_SEC) / WEAKEN_SEC);
    return { kind: "prep", p: 0, h: 0, g, w: w1 + w2 };
  }

  // At min sec / max money: binary search the largest hack thread count that fits.
  const perThread = ns.hackAnalyze(t);
  const cost = (/** @type {number} */ h) => {
    const p = Math.min(h * perThread, 0.95);
    const g = Math.ceil(ns.growthAnalyze(t, 1 / (1 - p)) * 1.05); // margin: grow lands at raised security
    const w = Math.ceil((h * HACK_SEC + g * GROW_SEC) / WEAKEN_SEC) + 1;
    return { kind: "hack", p, h, g, w };
  };
  let lo = 0, hi = Math.max(1, Math.floor(0.95 / perThread));
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const c = cost(mid);
    if (c.h + c.g + c.w <= capacity) lo = mid; else hi = mid - 1;
  }
  return lo > 0 ? cost(lo) : { kind: "idle", p: 0, h: 0, g: 0, w: 0 };
}

/**
 * Spread threads of script over hosts; returns threads actually started.
 * @param {NS} ns @param {{h: string, n: number}[]} free @param {string} script
 * @param {number} threads @param {string} target @param {number} nonce
 */
function run(ns, free, script, threads, target, nonce) {
  let started = 0;
  for (const f of free) {
    if (started >= threads) break;
    const n = Math.min(f.n, threads - started);
    if (n < 1) continue;
    if (ns.exec(script, f.h, n, target, nonce)) {
      f.n -= n;
      started += n;
    }
  }
  return started;
}
