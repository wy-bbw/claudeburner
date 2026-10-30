import { cycleSeconds } from "lib/infiltration-targets.js";
import { appendLog } from "lib/log.js";
import {
  DEMAND_DECAY_PER_SECOND, REFUSE_DIFFICULTY, chooseTradeFaction, findInfiltration, floorsForDemand, pressInfiltrateButton, readMarketDemand,
  sellForMoney, solveCurrentStage, stageKind, tradeForReputation,
} from "lib/infiltration-minigames.js";

const LOG_FILE = "data/infiltration-autopilot.txt";
const TICK_MS = 5;
const OPEN_TIMEOUT_MS = 4_000; // "Infiltrate Company" must show up this soon after goToLocation
const TRADE_TIMEOUT_MS = 3_000;
const RETRY_COOLDOWN_MS = 15_000;
const MIN_HP_FRACTION = 0.7; // visit the hospital below this before starting (a failure costs 3 x security level HP)

// infiltration-autopilot.js (home, Singularity API): the whole infiltration loop. Picks the target that pays the most
// per second (see demand below), travels to its city, opens it with the "Infiltrate Company" handler (the game wants
// event.isTrusted there: the handler is called with a plain object), solves every level (lib/infiltration-minigames.js),
// then trades the intel for faction rep or sells it for money.
// Market demand: every infiltration adds its level count to "floors" (decay 0.02/s) and the payout is multiplied by
// 1 - 0.001 x floors^2, taken when Start is pressed. The start screen shows the demand, so the autopilot waits THERE until
// it is at least --min-demand (the API's reward is the undamaged one). Targets are ranked by reward per cycle, where a
// cycle is the longer of the run time and the time the floors need to decay back to the --min-demand level.
//   --faction <name>      trade for this faction's reputation (you must be a member), e.g. "The Syndicate". Without it: money.
//   --money-floor <n>     sell for money instead of rep while your money is below n (default 0 = always rep)
//   --max-difficulty <n>  never pick a target above this difficulty (default 3.4; the game kills you at 3.5)
//   --cities <list>       only these cities, comma-separated (default: all; e.g. "New Tokyo" or "Sector-12,Volhaven")
//   --runs <n>            stop after n infiltrations (default 3; Infinity = never)
//   --stop-at-money <n>   stop once your money is at least n, checked between runs (e.g. 150e9; default: never)
//   --min-demand <f>      start a run only when the market demand is at least this (default 0.75; 0 = never wait)
//   --return-city <name>  travel here when the autopilot ends, so the gym trainer has a gym ("none" = stay; default Sector-12)
// Log: data/infiltration-autopilot.txt. Stop it (mid-run it just leaves the infiltration open) with tools/kill.js.
// Do not run it together with services/infiltration-solver.js. It travels between cities (costs money), so stop
// services/gym-trainer.js if you want a fixed city: the trainer never travels but waits in cities without a gym.
// Usage: run services/infiltration-autopilot.js --faction "The Syndicate" [--cities "New Tokyo"] [--money-floor 1e9] [--stop-at-money 150e9]
/** @param {NS} ns */
export async function main(ns) {
  const options = ns.flags([["faction", ""], ["money-floor", 0], ["max-difficulty", 3.4], ["cities", ""], ["runs", 3], ["stop-at-money", Infinity], ["min-demand", 0.75], ["return-city", "Sector-12"]]);
  const stopAtMoney = Number(options["stop-at-money"]);
  const minDemand = Math.min(Number(options["min-demand"]), 0.99);
  const returnCity = String(options["return-city"]);
  const faction = String(options.faction);
  const moneyFloor = Number(options["money-floor"]);
  const maxDifficulty = Math.min(Number(options["max-difficulty"]), REFUSE_DIFFICULTY - 0.01);
  const cities = String(options.cities).split(",").map((name) => name.trim()).filter(Boolean);
  const maxRuns = Number(options.runs);
  ns.disableLog("ALL");
  ns.ui.openTail();
  const say = (/** @type {string} */ event, /** @type {string} */ details) => { ns.print(`${event}: ${details}`); appendLog(ns, LOG_FILE, event, details); };
  say("start", `faction ${faction || "(none: money)"}, money floor ${moneyFloor}, max difficulty ${maxDifficulty}, cities ${cities.join(",") || "all"}, `
    + `runs ${maxRuns}${stopAtMoney < Infinity ? `, stop at $${ns.format.number(stopAtMoney)}` : ""}`);

  let runs = 0;
  let wait = { until: 0, reason: "" }; // pause between failed attempts
  let opening = { since: 0, location: "", pressed: 0 }; // we called goToLocation and wait for the button
  /** @type {{infiltration: any, mode: string, since: number, chose: boolean, paid: boolean, moneyBefore: number, repBefore: number}} */
  let finishing = { infiltration: null, mode: "money", since: 0, chose: false, paid: false, moneyBefore: 0, repBefore: 0 }; // success screen handling
  const policy = { faction, moneyFloor, maxDifficulty, cities, minDemand };
  let lastWarning = "";
  let lastTarget = ""; // best target of the previous pick: a change means a stat milestone or a different demand situation
  const reported = new WeakSet();
  const pacingLogged = new WeakSet();
  const startDemand = new WeakMap(); // demand at Start, for the run log

  while (runs < maxRuns) {
    try {
      const infiltration = findInfiltration();
      if (!infiltration && !opening.since && ns.getPlayer().money >= stopAtMoney) {
        say("money", `$${ns.format.number(ns.getPlayer().money)} >= $${ns.format.number(stopAtMoney)}: stopping`);
        break;
      }
      if (infiltration) {
        opening.since = 0;
        const kind = stageKind(infiltration.stage);
        if (kind === "idle" && infiltration.gameStartTimestamp < 0) {
          if (!reported.has(infiltration)) {
            const difficulty = infiltration.startingDifficulty;
            const demand = readMarketDemand();
            if (difficulty > maxDifficulty) {
              reported.add(infiltration);
              say("refused", `${infiltration.location.name}: difficulty ${difficulty.toFixed(2)} > ${maxDifficulty}; cancelling`);
              infiltration.cancel();
              wait = { until: Date.now() + RETRY_COOLDOWN_MS, reason: "too hard" };
            } else if (demand !== null && demand < minDemand) {
              // the start screen re-reads the demand every second; the payout uses the moment Start is pressed
              if (!pacingLogged.has(infiltration)) {
                pacingLogged.add(infiltration);
                const seconds = Math.log(floorsForDemand(demand) / floorsForDemand(minDemand)) / DEMAND_DECAY_PER_SECOND;
                say("pacing", `${infiltration.location.name}: demand ${(demand * 100).toFixed(0)}% < ${(minDemand * 100).toFixed(0)}%, starting in about ${seconds.toFixed(0)} s`);
              }
            } else {
              reported.add(infiltration);
              if (demand !== null) startDemand.set(infiltration, demand);
              infiltration.startInfiltration();
            }
          }
        } else if (kind === "idle") {
          if (finishing.infiltration !== infiltration) {
            const player = ns.getPlayer();
            const mode = decideMode(player, policy).mode;
            finishing = { infiltration, mode, since: Date.now(), chose: false, paid: false, moneyBefore: player.money, repBefore: mode === "rep" ? ns.singularity.getFactionRep(/** @type {any} */ (faction)) : 0 };
          }
          if (!finishing.paid && finishTrade(ns, finishing, faction)) {
            finishing.paid = true;
            runs++;
            const gained = finishing.mode === "rep"
              ? `${ns.format.number(ns.singularity.getFactionRep(/** @type {any} */ (faction)) - finishing.repBefore)} ${faction} rep`
              : `$${ns.format.number(ns.getPlayer().money - finishing.moneyBefore)}`;
            const demand = startDemand.get(infiltration);
            say("run", `${runs}: ${infiltration.location.name} (${infiltration.maxLevel} levels) -> ${gained}${demand === undefined ? "" : `, demand at start ${(demand * 100).toFixed(0)}%`}`);
          }
        } else {
          solveCurrentStage(infiltration);
        }
      } else if (Date.now() >= wait.until) {
        if (opening.since && Date.now() - opening.since < OPEN_TIMEOUT_MS) {
          // one press is enough: the screen needs a render or two to change, more presses would open duplicates
          if (Date.now() - opening.pressed > 500 && pressInfiltrateButton()) opening.pressed = Date.now();
        } else {
          if (opening.since) { say("timeout", `no "Infiltrate Company" button at ${opening.location}`); wait = { until: Date.now() + RETRY_COOLDOWN_MS, reason: "no button" }; opening.since = 0; }
          else {
            const hurt = ns.getPlayer().hp;
            if (hurt.current < hurt.max * MIN_HP_FRACTION) {
              say("heal", `hp ${hurt.current} / ${hurt.max}: hospital before the next infiltration`);
              ns.singularity.hospitalize();
            }
            const next = pickTarget(ns, policy);
            if ("reason" in next) {
              if (next.reason !== lastWarning) { lastWarning = next.reason; say("waiting", next.reason); }
              wait = { until: Date.now() + RETRY_COOLDOWN_MS, reason: next.reason };
            } else {
              if (next.warning && next.warning !== lastWarning) { lastWarning = next.warning; say("warning", next.warning); }
              if (next.name !== lastTarget) {
                if (lastTarget) say("target", `new best target: ${next.name} (was ${lastTarget}); difficulty ${next.difficulty.toFixed(2)}, ${next.levels} levels`);
                lastTarget = next.name;
              }
              if (ns.getPlayer().city !== next.city && !ns.singularity.travelToCity(/** @type {Parameters<NS["singularity"]["travelToCity"]>[0]} */ (next.city))) {
                say("blocked", `cannot travel to ${next.city} (money?)`);
                wait = { until: Date.now() + RETRY_COOLDOWN_MS, reason: "travel" };
              } else if (!ns.singularity.goToLocation(/** @type {Parameters<NS["singularity"]["goToLocation"]>[0]} */ (next.name))) {
                say("blocked", `goToLocation(${next.name}) refused`);
                wait = { until: Date.now() + RETRY_COOLDOWN_MS, reason: "location" };
              } else {
                say("open", `${next.name} (${next.city}, difficulty ${next.difficulty.toFixed(2)}, ${next.levels} levels, pays ${next.mode === "rep" ? ns.format.number(next.value) + " rep" : "$" + ns.format.number(next.value)})`);
                opening = { since: Date.now(), location: next.name, pressed: 0 };
              }
            }
          }
        }
      }
    } catch (error) {
      say("error", String(error));
      wait = { until: Date.now() + RETRY_COOLDOWN_MS, reason: "error" };
    }
    await ns.sleep(TICK_MS);
  }
  say("done", `${runs} infiltrations`);
  if (returnCity !== "none" && ns.getPlayer().city !== returnCity) {
    if (ns.singularity.travelToCity(/** @type {Parameters<NS["singularity"]["travelToCity"]>[0]} */ (returnCity))) say("travel", `back to ${returnCity}`);
    else say("blocked", `cannot travel back to ${returnCity}`);
  }
}

/**
 * Success screen: trade for rep (pick the faction, then press Trade one tick later) or sell. Returns true once, when the
 * infiltration is paid out. Falls back to selling when trading does not work within a few seconds.
 * @param {NS} ns @param {{infiltration: any, mode: string, since: number, chose: boolean, paid: boolean}} finishing @param {string} faction
 */
function finishTrade(ns, finishing, faction) {
  if (finishing.mode === "rep") {
    if (!finishing.chose) { finishing.chose = chooseTradeFaction(faction); return false; }
    if (tradeForReputation()) return true;
    if (Date.now() - finishing.since < TRADE_TIMEOUT_MS) return false;
    ns.print(`trading for ${faction} did not work, selling instead`);
    finishing.mode = "money";
  }
  return sellForMoney();
}

/**
 * Rep or money: rep for the faction while you are a member and your money is at least the floor.
 * @param {{money: number, factions: string[]}} player @param {{faction: string, moneyFloor: number}} policy
 */
function decideMode(player, policy) {
  if (!policy.faction || player.money < policy.moneyFloor) return { mode: "money", warning: "" };
  if (!player.factions.includes(/** @type {any} */ (policy.faction))) {
    return { mode: "money", warning: `you are not a member of ${policy.faction}: selling for money` };
  }
  return { mode: "rep", warning: "" };
}

/**
 * The target that pays the most per second right now. The reward of getInfiltration already includes the market demand.
 * @param {NS} ns @param {{faction: string, moneyFloor: number, maxDifficulty: number, cities: string[], minDemand: number}} policy
 * @returns {{name: string, city: string, difficulty: number, levels: number, value: number, mode: string, warning: string, score: number} | {reason: string}}
 */
function pickTarget(ns, policy) {
  const player = ns.getPlayer();
  const { mode, warning } = decideMode(player, policy);
  /** @type {{name: string, city: string, difficulty: number, levels: number, value: number, mode: string, warning: string, score: number} | null} */
  let best = null;
  for (const location of ns.infiltration.getPossibleLocations()) {
    if (policy.cities.length && !policy.cities.includes(location.city)) continue;
    const info = ns.infiltration.getInfiltration(location.name);
    if (info.difficulty > policy.maxDifficulty) continue;
    const value = mode === "rep" ? info.reward.tradeRep : info.reward.sellCash;
    const score = value / cycleSeconds(info.maxClearanceLevel, policy.minDemand);
    if (!best || score > best.score) {
      best = { name: location.name, city: location.city, difficulty: info.difficulty, levels: info.maxClearanceLevel, value, mode, warning, score };
    }
  }
  if (!best) return { reason: `no target at difficulty <= ${policy.maxDifficulty} in ${policy.cities.join(",") || "any city"}` };
  return best;
}
