// stop-work.js (home, Singularity API): stops whatever the player is doing (crime, gym, class, company or faction work,
// program creation) and prints what it was. Crime work repeats by itself without any script, so killing a crime script
// does not end it.
// Usage: run tools/stop-work.js
/** @param {NS} ns */
export async function main(ns) {
  const work = ns.singularity.getCurrentWork();
  const result = !work ? "not working on anything"
    : `${ns.singularity.stopAction() ? "stopped" : "could not stop"}: ${JSON.stringify(work)}`;
  ns.tprint(result);
  ns.write("data/stop-work.txt", result + "\n", "w");
}
