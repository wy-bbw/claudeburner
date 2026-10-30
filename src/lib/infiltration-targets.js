import { DEMAND_DECAY_PER_SECOND, floorsForDemand } from "lib/infiltration-minigames.js";

const SECONDS_PER_LEVEL = 1.3; // 0.9 s "Get Ready" plus the odd wait in the slash game; only used to rank targets
const SECONDS_PER_RUN = 6; // open, start, trade

/**
 * Seconds per run of a target in the autopilot's loop: the longer of the run itself and the time the market floors
 * need to decay back to the minDemand level (after a start the floors are F* + levels). Rewards divided by this rank
 * targets by money (or rep) per second.
 * @param {number} levels @param {number} minDemand 0 = never wait for the demand
 */
export function cycleSeconds(levels, minDemand) {
  const runSeconds = levels * SECONDS_PER_LEVEL + SECONDS_PER_RUN;
  const paceSeconds = minDemand > 0 ? Math.log(1 + levels / floorsForDemand(minDemand)) / DEMAND_DECAY_PER_SECOND : 0;
  return Math.max(runSeconds, paceSeconds);
}
