import { appendLog } from "lib/log.js";

const LOG_FILE = "data/gym-trainer.txt";
const CHECK_MS = 5_000;
const SWITCH_MARGIN = 2; // stay on the current stat until it is this many levels above the lowest (no flip-flopping)
const STAT_NAMES = /** @type {const} */ ({ def: "defense", str: "strength", dex: "dexterity", agi: "agility" });
// Gym -> city. Exp multipliers from the game code (exp per second): Powerhouse 10, Snap 5, Millenium 4, Crush 2, Iron 1.
const GYM_CITIES = /** @type {Record<string, CityName>} */ ({
  "Powerhouse Gym": "Sector-12", "Iron Gym": "Sector-12", "Crush Fitness Gym": "Aevum", "Snap Fitness Gym": "Aevum",
  "Millenium Fitness Gym": "Volhaven",
});

// gym-trainer.js (home, needs the Singularity API: BitNode 4 or Source-File 4): trains the combat stats at the
// fastest gym, always the lowest stat first (infiltration difficulty falls with the sum of the stats; defense also
// sets max HP = floor(10 + defense / 10)). Travels to the gym's city, takes over the current work (stop crime.js
// first), logs to data/gym-trainer.txt. Runs until you stop it or every listed stat reaches --target.
//   --stats <list>   from def,str,dex,agi (default all four)
//   --target <n>     stop when every listed stat has this level (default: never)
//   --gym <name>     default "Powerhouse Gym" (fastest; "Iron Gym" is the cheapest per exp)
//   --background     train unfocused: you can use the game meanwhile, but exp is x0.8 (BaseFocusBonus; no penalty with
//                    the Neuroreceptor Management Implant). Default: focused.
// Usage: run services/gym-trainer.js [--stats def,str] [--target 1000] [--gym "Iron Gym"] [--background]
/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  const options = ns.flags([["stats", "def,str,dex,agi"], ["target", Infinity], ["gym", "Powerhouse Gym"], ["background", false]]);
  const target = Number(options.target);
  const gym = String(options.gym);
  const city = GYM_CITIES[gym];
  if (!city) {
    ns.tprint(`Unknown gym "${gym}". Choose one of: ${Object.keys(GYM_CITIES).join(", ")}`);
    return;
  }
  const stats = String(options.stats).split(",").map((name) => name.trim()).filter(Boolean);
  const unknown = stats.filter((name) => !(name in STAT_NAMES));
  if (!stats.length || unknown.length) {
    ns.tprint(`Unknown stat(s) ${unknown.join(", ") || "(none given)"}. Use def, str, dex, agi.`);
    return;
  }
  let training = "";
  let firstRound = true; // restart the work once so a changed --background takes effect for an already running class
  while (true) {
    const player = ns.getPlayer();
    const levels = stats
      .map((name) => ({ name, level: player.skills[STAT_NAMES[/** @type {keyof typeof STAT_NAMES} */ (name)]] }))
      .filter((stat) => stat.level < target)
      .sort((a, b) => a.level - b.level);
    if (!levels.length) {
      appendLog(ns, LOG_FILE, "done", `${stats.join(",")} reached ${target} (hp ${player.hp.max})`);
      ns.singularity.stopAction();
      return;
    }
    const current = levels.find((stat) => stat.name === training);
    const next = current && current.level - levels[0].level < SWITCH_MARGIN ? current : levels[0];
    const work = ns.singularity.getCurrentWork();
    const doing = work?.type === "CLASS" ? String(work.classType) : "";
    if (doing !== next.name || firstRound) {
      firstRound = false;
      if (player.city !== city && !ns.singularity.travelToCity(city)) {
        appendLog(ns, LOG_FILE, "blocked", `cannot travel to ${city} for ${gym} (money?)`);
      } else if (ns.singularity.gymWorkout(/** @type {Parameters<NS["singularity"]["gymWorkout"]>[0]} */ (gym), /** @type {Parameters<NS["singularity"]["gymWorkout"]>[1]} */ (next.name), !options.background)) {
        if (training !== next.name) {
          appendLog(ns, LOG_FILE, "train", `${next.name} at ${next.level} (${levels.map((stat) => `${stat.name} ${stat.level}`).join(", ")}; hp ${player.hp.max})`);
        }
        training = next.name;
      } else {
        appendLog(ns, LOG_FILE, "blocked", `gymWorkout(${gym}, ${next.name}) refused`);
      }
    }
    await ns.sleep(CHECK_MS);
  }
}
