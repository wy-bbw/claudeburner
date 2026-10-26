import { appendLog } from "lib/log.js";
import { FARM_LOG_FILE, FARM_SETTINGS_FILE, FARM_STOP_FILE, KEEP_ON_INSTALL_FACTIONS } from "lib/intelligence-farm.js";

// join-and-reset.js (home, Singularity API): one cycle of the Intelligence farm. Joins every keepOnInstall faction that
// has invited you (7.5 Intelligence XP each), then soft resets with itself as the callback, so the game starts it again
// 0.5 s after the reset and the next cycle joins the re-issued invites. Stops at the target level, the deadline or when
// data/intelligence-farm-stop.txt exists, and then spawns the follow-up script instead of resetting.
// Started only by tools/intelligence/farm.js, which writes data/intelligence-farm.json.
/** @param {NS} ns */
export async function main(ns) {
  const settingsText = ns.read(FARM_SETTINGS_FILE);
  if (!settingsText) {
    ns.tprint(`ERROR ${FARM_SETTINGS_FILE} is missing: start the farm with run tools/intelligence/farm.js`);
    return;
  }
  /** @type {import("lib/intelligence-farm.js").FarmSettings} */
  const settings = JSON.parse(settingsText);

  let joined = 0;
  for (const faction of KEEP_ON_INSTALL_FACTIONS) {
    if (ns.singularity.joinFaction(faction)) joined++;
  }
  settings.cycles++;
  ns.write(FARM_SETTINGS_FILE, JSON.stringify(settings), "w");

  const player = ns.getPlayer();
  const level = player.skills.intelligence;
  const gained = player.exp.intelligence - settings.startExperience;
  const elapsedSeconds = Math.max(1, (Date.now() - settings.startedAt) / 1000);
  const status = `cycle ${settings.cycles}, joined ${joined}, intelligence ${level}, +${ns.format.number(gained)} XP`
    + ` in ${ns.format.time(elapsedSeconds * 1000)} (${ns.format.number(gained / elapsedSeconds)} XP/s,`
    + ` ${ns.format.number(settings.cycles / elapsedSeconds)} cycles/s)`;

  let stopReason = "";
  if (settings.targetIntelligence > 0 && level >= settings.targetIntelligence) stopReason = `intelligence ${settings.targetIntelligence} reached`;
  else if (Date.now() >= settings.deadline) stopReason = "time is up";
  else if (ns.fileExists(FARM_STOP_FILE, "home")) stopReason = `${FARM_STOP_FILE} exists`;
  // The first cycle may find every faction already joined; from the second on, joining nothing means nothing to farm.
  else if (joined === 0 && settings.cycles > 1) stopReason = "no faction could be joined (no keepOnInstall invites)";

  if (!stopReason) {
    if (settings.cycles % 60 === 1) appendLog(ns, FARM_LOG_FILE, "cycle", status);
    ns.singularity.softReset(ns.getScriptName());
    return;
  }
  appendLog(ns, FARM_LOG_FILE, "stop", `${stopReason}; ${status}`);
  ns.tprint(`Intelligence farm stopped: ${stopReason}; ${status}`);
  if (settings.followUpScript !== "none") ns.spawn(settings.followUpScript, { threads: 1, spawnDelay: 100 });
}
