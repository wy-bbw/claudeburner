import { PHISHING_STATUS_PORT } from "lib/ports.js";

// darknet-phish.js: phishes forever from the darknet server it runs on (phishingAttack only works there).
// Started by workers/darknet-crawl.js with all the server's RAM: money per success scales with threads.
// Mostly charisma XP; now and then it leaves a .cache file, which the next sweep's crawler opens.
// Reports {threads, attempts, successes, last} for its host in PHISHING_STATUS_PORT after every attempt.
/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  const status = { threads: ns.self().threads, attempts: 0, successes: 0, last: "started" };
  reportStatus(ns, status);
  while (true) {
    const result = await ns.dnet.phishingAttack();
    status.attempts++;
    if (result.success) status.successes++;
    status.last = result.message;
    reportStatus(ns, status);
  }
}

/** Read and write without an await in between, so phishers cannot overwrite each other. @param {NS} ns @param {object} status */
function reportStatus(ns, status) {
  const data = ns.peek(PHISHING_STATUS_PORT);
  const allStatus = data === "NULL PORT DATA" ? {} : JSON.parse(data);
  allStatus[ns.getHostname()] = status;
  ns.clearPort(PHISHING_STATUS_PORT);
  ns.writePort(PHISHING_STATUS_PORT, JSON.stringify(allStatus));
}
