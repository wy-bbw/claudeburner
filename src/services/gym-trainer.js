import { appendLog } from "lib/log.js";

const LOG_FILE = "data/gym-trainer.txt";
const CHECK_MS = 5_000;
const SWITCH_MARGIN = 2; // --order lowest: stay on the current stat until it is this many levels above the lowest (no flip-flopping)
const SWITCH_GAIN = 1.1; // --order most-levels: switch only when another stat gains this much more levels per second
const EXP_OFFSET = 534.6; // level = floor(mult x (32 ln(exp + 534.6) - 200)), calculateSkill in the game code
const STAT_NAMES = /** @type {const} */ ({ def: "defense", str: "strength", dex: "dexterity", agi: "agility" });
// Gyms with their exp multipliers (exp per second) from the game code. Only these three cities have gyms.
const GYMS = [
  { name: "Powerhouse Gym", city: "Sector-12", expMultiplier: 10 }, { name: "Snap Fitness Gym", city: "Aevum", expMultiplier: 5 },
  { name: "Millenium Fitness Gym", city: "Volhaven", expMultiplier: 4 }, { name: "Crush Fitness Gym", city: "Aevum", expMultiplier: 2 },
  { name: "Iron Gym", city: "Sector-12", expMultiplier: 1 },
];
const FASTEST_GYM = GYMS[0];

// gym-trainer.js (home, needs the Singularity API: BitNode 4 or Source-File 4): trains the combat stats at the
// best gym of the city you are in. Default order: the stat that gains the most levels per second of training (32 x level
// multiplier x exp multiplier / (exp + 534.6); the multiplier is read back from your level and exp), which grows the SUM
// fastest: infiltration difficulty falls with the sum of all five stats. --order lowest trains the lowest stat first
// (every stat >= N, e.g. The Syndicate's 200). Defense also sets max HP = floor(10 + defense / 10).
// Never travels on its own: it trains in the city you are in if that has a gym
// (Sector-12 Powerhouse x10, Aevum Snap x5, Volhaven Millenium x4) and waits in cities without one (New Tokyo, Ishima,
// Chongqing) until you are back in a gym city. Takes over the current work (stop crime.js first), logs to
// data/gym-trainer.txt. Runs until you stop it or every listed stat reaches --target.
//   --stats <list>   from def,str,dex,agi (default all four)
//   --order <o>      most-levels (default) or lowest
//   --target <n>     stop when every listed stat has this level (default: never)
//   --gym <name>     always use this gym and travel to it (default: the best gym where you are)
//   --travel         in a city without a gym, travel to Sector-12 instead of waiting
//   --foreground     train focused: exp x1.25 compared with the default, but the game wants your attention. The default
//                    is unfocused (x0.8 exp, BaseFocusBonus; no penalty with the Neuroreceptor Management Implant).
// Usage: run services/gym-trainer.js [--order lowest] [--stats def,str] [--target 1000] [--gym "Iron Gym"] [--travel] [--foreground]
/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  const options = ns.flags([["order", "most-levels"], ["stats", "def,str,dex,agi"], ["target", Infinity], ["gym", ""], ["travel", false], ["foreground", false]]);
  const target = Number(options.target);
  const order = String(options.order);
  if (order !== "most-levels" && order !== "lowest") {
    ns.tprint(`Unknown --order "${order}". Use most-levels or lowest.`);
    return;
  }
  const fixedGym = options.gym ? GYMS.find((candidate) => candidate.name === options.gym) : null;
  if (options.gym && !fixedGym) {
    ns.tprint(`Unknown gym "${options.gym}". Choose one of: ${GYMS.map((candidate) => candidate.name).join(", ")}`);
    return;
  }
  const stats = String(options.stats).split(",").map((name) => name.trim()).filter(Boolean);
  const unknown = stats.filter((name) => !(name in STAT_NAMES));
  if (!stats.length || unknown.length) {
    ns.tprint(`Unknown stat(s) ${unknown.join(", ") || "(none given)"}. Use def, str, dex, agi.`);
    return;
  }
  let training = "";
  let waitingInCity = ""; // city without a gym we already logged
  let firstRound = true; // restart the work once so a changed --foreground takes effect for an already running class
  while (true) {
    const player = ns.getPlayer();
    const levels = stats
      .map((name) => {
        const skill = STAT_NAMES[/** @type {keyof typeof STAT_NAMES} */ (name)];
        const level = player.skills[skill];
        const exp = player.exp[skill];
        // level multiplier read back from the level (floored, so slightly low), times the exp multiplier of the stat
        const levelMultiplier = level / (32 * Math.log(exp + EXP_OFFSET) - 200);
        const levelsPerExp = 32 * levelMultiplier * player.mults[`${skill}_exp`] / (exp + EXP_OFFSET);
        return { name, level, levelsPerExp };
      })
      .filter((stat) => stat.level < target)
      .sort((a, b) => (order === "lowest" ? a.level - b.level : b.levelsPerExp - a.levelsPerExp));
    if (!levels.length) {
      appendLog(ns, LOG_FILE, "done", `${stats.join(",")} reached ${target} (hp ${player.hp.max})`);
      ns.singularity.stopAction();
      return;
    }
    const current = levels.find((stat) => stat.name === training);
    const keepCurrent = current && (order === "lowest"
      ? current.level - levels[0].level < SWITCH_MARGIN
      : current.levelsPerExp * SWITCH_GAIN > levels[0].levelsPerExp);
    const next = keepCurrent ? current : levels[0];
    const work = ns.singularity.getCurrentWork();
    const gym = fixedGym ?? GYMS.find((candidate) => candidate.city === player.city) ?? (options.travel ? FASTEST_GYM : null);
    if (!gym) {
      if (waitingInCity !== player.city) appendLog(ns, LOG_FILE, "waiting", `no gym in ${player.city}; training resumes in Sector-12, Aevum or Volhaven`);
      waitingInCity = player.city;
      training = "";
      await ns.sleep(CHECK_MS);
      continue;
    }
    waitingInCity = "";
    const doing = work?.type === "CLASS" && work.location === gym.name ? String(work.classType) : "";
    if (doing !== next.name || firstRound) {
      firstRound = false;
      if (player.city !== gym.city && !ns.singularity.travelToCity(/** @type {Parameters<NS["singularity"]["travelToCity"]>[0]} */ (gym.city))) {
        appendLog(ns, LOG_FILE, "blocked", `cannot travel to ${gym.city} for ${gym.name} (money?)`);
      } else if (ns.singularity.gymWorkout(/** @type {Parameters<NS["singularity"]["gymWorkout"]>[0]} */ (gym.name), /** @type {Parameters<NS["singularity"]["gymWorkout"]>[1]} */ (next.name), Boolean(options.foreground))) {
        if (training !== next.name) {
          const describe = (/** @type {typeof next} */ stat) => `${stat.name} ${stat.level}`
            + (order === "lowest" ? "" : ` +${(stat.levelsPerExp * 1000).toFixed(1)}/kexp`);
          appendLog(ns, LOG_FILE, "train", `${next.name} at ${gym.name}, ${next.level} (${levels.map(describe).join(", ")}; hp ${player.hp.max})`);
        }
        training = next.name;
      } else {
        appendLog(ns, LOG_FILE, "blocked", `gymWorkout(${gym.name}, ${next.name}) refused`);
      }
    }
    await ns.sleep(CHECK_MS);
  }
}
