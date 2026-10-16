import { appendLog } from "lib/log.js";

const LOG_FILE = "data/crime.txt";
const CHECK_MS = 10_000;
// Base duration (s) and money per success, from the game code. Ranking only needs the ratios: the BitNode and player
// crime money multipliers scale every crime alike. Larceny is missing from the game's crime table data we read.
const CRIMES = /** @type {const} */ ([
  ["Shoplift", 2, 15e3], ["Rob Store", 60, 4e5], ["Mug", 4, 36e3], ["Deal Drugs", 10, 12e4], ["Bond Forgery", 300, 4.5e6],
  ["Traffick Arms", 40, 6e5], ["Homicide", 3, 45e3], ["Grand Theft Auto", 80, 1.6e6], ["Kidnap", 120, 3.6e6],
  ["Assassination", 300, 12e6], ["Heist", 600, 120e6],
]);

// crime.js (home, needs the Singularity API: BitNode 4 or Source-File 4): commits the crime with the best expected
// money per second (success chance x money / duration) and switches as the stats grow. The game repeats a crime by
// itself; every 10 s this checks whether a better one is available. --karma ranks by karma per second instead
// (Homicide). Log: data/crime.txt. Stop it (and the crime) with: run tools/kill.js home services/crime.js
// Usage: run services/crime.js [--karma]
/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  const flags = ns.flags([["karma", false]]);
  const karmaPerSuccess = { Shoplift: 0.1, "Rob Store": 0.5, Mug: 0.25, "Deal Drugs": 0.5, "Bond Forgery": 0.1, "Traffick Arms": 1,
    Homicide: 3, "Grand Theft Auto": 5, Kidnap: 6, Assassination: 10, Heist: 15 };
  let current = "";
  while (true) {
    const ranked = CRIMES.map(([crime, seconds, money]) => {
      const chance = ns.singularity.getCrimeChance(crime);
      const value = flags.karma ? karmaPerSuccess[crime] : money;
      return { crime, chance, perSecond: chance * value / seconds };
    }).sort((a, b) => b.perSecond - a.perSecond);
    const best = ranked[0];
    const work = ns.singularity.getCurrentWork();
    const doing = work?.type === "CRIME" ? work.crimeType : "";
    if (best.crime !== doing) {
      ns.singularity.commitCrime(best.crime, false);
      if (best.crime !== current) appendLog(ns, LOG_FILE, "crime", `${best.crime} (success ${(best.chance * 100).toFixed(0)}%)`);
      current = best.crime;
    }
    await ns.sleep(CHECK_MS);
  }
}
