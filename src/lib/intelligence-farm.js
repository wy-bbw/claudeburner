// Shared by tools/intelligence/farm.js and workers/intelligence/join-and-reset.js.
/** @typedef {ReturnType<NS["getPlayer"]>["factions"][number]} FactionName */

export const FARM_WORKER = "workers/intelligence/join-and-reset.js";
export const FARM_SETTINGS_FILE = "data/intelligence-farm.json";
export const FARM_LOG_FILE = "data/intelligence-farm.txt";
export const FARM_STOP_FILE = "data/intelligence-farm-stop.txt";
export const INTELLIGENCE_XP_PER_JOIN = 7.5;

/**
 * Factions with keepOnInstall (game code v3.0.1, FactionInfo.tsx): a reset invites them again at once if you were a
 * member or had an invite, so every soft reset can join them again for 7.5 Intelligence XP each.
 * @type {FactionName[]}
 */
export const KEEP_ON_INSTALL_FACTIONS = [
  "ECorp", "MegaCorp", "Bachman & Associates", "Blade Industries", "NWO", "Clarke Incorporated",
  "OmniTek Incorporated", "Four Sigma", "KuaiGong International", "Fulcrum Secret Technologies",
  "Church of the Machine God", "Shadows of Anarchy",
];

/**
 * @typedef {object} FarmSettings
 * @property {number} startedAt epoch ms
 * @property {number} deadline epoch ms
 * @property {number} targetIntelligence 0 = no target
 * @property {string} followUpScript started when the farm stops, "none" = nothing
 * @property {number} startExperience Intelligence XP at the start
 * @property {number} cycles
 */
