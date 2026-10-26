import { appendLog } from "lib/log.js";
import {
  FARM_LOG_FILE, FARM_SETTINGS_FILE, FARM_STOP_FILE, FARM_WORKER, INTELLIGENCE_XP_PER_JOIN, KEEP_ON_INSTALL_FACTIONS,
} from "lib/intelligence-farm.js";

// farm.js (home): starts the Intelligence farm, a soft-reset loop (workers/intelligence/join-and-reset.js) that joins
// every keepOnInstall faction (megacorp factions, Fulcrum Secret Technologies, Shadows of Anarchy, Church of the Machine
// God) after each reset for 7.5 Intelligence XP each. The game re-invites them on every reset (game code v3.0.1).
// Every reset wipes money, hacking/combat/charisma XP, other factions and running scripts, and installs queued
// augmentations: best right after an install, while nothing else is running anyway. The corporation keeps running.
// Log: data/intelligence-farm.txt (every 60 cycles and the stop). Stop early: write data/intelligence-farm-stop.txt.
// Usage: run tools/intelligence/farm.js [--target-intelligence <level>] (0 = none) [--hours <h>] (default 8)
//        [--then <script on home>] (default start.js; "none" starts nothing) [--yes] (no confirmation dialog)
/** @param {NS} ns */
export async function main(ns) {
  const flags = ns.flags([["target-intelligence", 0], ["hours", 8], ["then", "start.js"], ["yes", false]]);
  const targetIntelligence = Number(flags["target-intelligence"]);
  const hours = Number(flags.hours);
  const followUpScript = String(flags.then);
  if (followUpScript !== "none" && !ns.fileExists(followUpScript, "home")) {
    ns.tprint(`ERROR --then ${followUpScript} does not exist on home; farm not started`);
    return;
  }

  const player = ns.getPlayer();
  // Pending invites (e.g. right after an install) do not show in getPlayer and checkFactionInvitations costs 48 GB:
  // the first cycle joins them, and the worker stops after cycle 2 if it could join nothing.
  const keptFactions = KEEP_ON_INSTALL_FACTIONS.filter((faction) => player.factions.includes(faction));
  const factionText = keptFactions.length > 0
    ? `It joins ${keptFactions.length} factions per cycle (~${keptFactions.length * INTELLIGENCE_XP_PER_JOIN} XP`
    : "You are a member of no keepOnInstall faction: only pending invites count (the farm stops if there are none";
  const minutesSinceReset = (Date.now() - ns.getResetInfo().lastAugReset) / 60000;
  const stopText = [
    targetIntelligence > 0 ? `at intelligence ${targetIntelligence}` : "",
    `after ${hours} h`,
    `or when ${FARM_STOP_FILE} exists`,
  ].filter(Boolean).join(", ");
  const question = `Start the Intelligence farm? ${factionText}; intelligence now ${player.skills.intelligence}).`
    + ` The first soft reset wipes $${ns.format.number(player.money)}, your stats, other factions and scripts`
    + ` (${Math.round(minutesSinceReset)} min since the last reset) and installs queued augmentations.`
    + ` Stops ${stopText}, then starts ${followUpScript}.`;
  if (!flags.yes && !(await ns.prompt(question))) {
    ns.tprint("cancelled, farm not started");
    return;
  }

  if (ns.fileExists(FARM_STOP_FILE, "home")) ns.rm(FARM_STOP_FILE, "home");
  const startedAt = Date.now();
  /** @type {import("lib/intelligence-farm.js").FarmSettings} */
  const settings = {
    startedAt, deadline: startedAt + hours * 3600_000, targetIntelligence, followUpScript,
    startExperience: player.exp.intelligence, cycles: 0,
  };
  ns.write(FARM_SETTINGS_FILE, JSON.stringify(settings), "w");
  appendLog(ns, FARM_LOG_FILE, "start", `member of ${keptFactions.join(", ") || "none"}; intelligence ${player.skills.intelligence};`
    + ` stops ${stopText}; then ${followUpScript}`);
  if (ns.run(FARM_WORKER) === 0) {
    const free = ns.getServerMaxRam("home") - ns.getServerUsedRam("home");
    ns.tprint(`ERROR ${FARM_WORKER} needs ${ns.format.ram(ns.getScriptRam(FARM_WORKER))}, home has`
      + ` ${ns.format.ram(free)} free: kill other scripts first (they die with the first reset anyway)`);
  }
}
