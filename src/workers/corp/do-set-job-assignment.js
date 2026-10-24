import { performCalls } from "lib/corp-calls.js";

// workers/corp/do-set-job-assignment.js <JSON list of [division, city, job, amount]>: sets how many employees work a job (needs enough unassigned ones).
// One corporation action per script (20 GB); started via lib/corp-scripts.js runAction. Results -> data/corp/do-set-job-assignment.txt
/** @param {NS} ns */
export async function main(ns) {
  performCalls(ns, "set-job-assignment", ([division, city, job, amount]) => { if (!ns.corporation.setJobAssignment(division, city, job, amount)) throw new Error("not enough unassigned employees"); });
}
