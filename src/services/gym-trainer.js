import { runGymTrainer } from "lib/gym-training.js";

// gym-trainer.js (home, Singularity API): trains the combat stat that gains the most levels per exp, so the SUM of the
// stats grows fastest (infiltration difficulty). For a requirement on every stat (faction invites) use
// services/gym-trainer-lowest-stat.js. Flags and details: lib/gym-training.js.
// Usage: run services/gym-trainer.js [--stats def,str] [--target 1000] [--gym "Powerhouse Gym"] [--travel] [--foreground]
/** @param {NS} ns */
export async function main(ns) {
  await runGymTrainer(ns, "most-levels");
}
