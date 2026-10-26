import { runGymTrainer } from "lib/gym-training.js";

// gym-trainer-lowest-stat.js (home, Singularity API): trains the lowest combat stat first, for requirements on every stat
// (faction invites, e.g. The Syndicate 200 each). With --target it stops once every stat has that level. For the
// fastest growing SUM (infiltration) use services/gym-trainer.js. Flags and details: lib/gym-training.js.
// Usage: run services/gym-trainer-lowest-stat.js [--target 200] [--stats def,str] [--gym "Powerhouse Gym"] [--travel] [--foreground]
/** @param {NS} ns */
export async function main(ns) {
  await runGymTrainer(ns, "lowest");
}
