import { appendLog } from "lib/log.js";
import { DARKNET_EVENTS_PORT, DARKNET_VISITED_PORT, PHISHING_STATUS_PORT } from "lib/ports.js";

const CRAWLER = "workers/darknet/crawl.js";
const LOG_FILE = "data/darknet.txt";
const DARKNET_PROGRAM = "DarkscapeNavigator.exe";

// services/darknet/orchestrator.js (home): starts a darknet sweep (workers/darknet/crawl.js on home) every
// --interval-minutes, because darknet servers move, restart and appear. Each sweep reaches what the
// password guesses crack and leaves a phisher on every darknet server it reached.
// Log data/darknet.txt: the crawlers' events (failed logins with their hints, caches, files found, errors) and, before
// each new sweep, a summary of the last one: servers reached, phishers, threads, successes, karma.
// Needs the crawler's RAM free on home at sweep time; logs and skips the sweep otherwise.
// Waits for DarkscapeNavigator.exe (bought through TOR; without it every dnet call throws) and sweeps the
// moment it appears, instead of at the next interval.
/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  const options = ns.flags([["interval-minutes", 5]]);
  const intervalMs = Number(options["interval-minutes"]) * 60_000;
  let nextSweepTime = 0, waitingForNavigator = false;
  /** Login problems and files already logged: they show up again in every sweep (login problems from every neighbour). */
  const alreadyLogged = new Set();
  while (true) {
    drainEvents(ns, alreadyLogged);
    const hasNavigator = ns.fileExists(DARKNET_PROGRAM, "home");
    if (!hasNavigator && !waitingForNavigator) appendLog(ns, LOG_FILE, "waiting", `for ${DARKNET_PROGRAM} (buy it through TOR); sweeping as soon as it exists`);
    if (hasNavigator && waitingForNavigator) nextSweepTime = 0; // sweep right away
    waitingForNavigator = !hasNavigator;
    if (hasNavigator && Date.now() >= nextSweepTime) {
      if (nextSweepTime) logSummary(ns);
      const pid = ns.exec(CRAWLER, "home");
      if (!pid) appendLog(ns, LOG_FILE, "error", `could not start ${CRAWLER} on home (needs ${ns.getScriptRam(CRAWLER, "home")} GB)`);
      nextSweepTime = Date.now() + intervalMs;
    }
    await ns.sleep(1000);
  }
}

/** Moves the crawlers' events into the log; each login problem and file only once. @param {NS} ns @param {Set<string>} alreadyLogged */
function drainEvents(ns, alreadyLogged) {
  while (ns.peek(DARKNET_EVENTS_PORT) !== "NULL PORT DATA") {
    const event = JSON.parse(ns.readPort(DARKNET_EVENTS_PORT));
    if (event.type === "unknown" || event.type === "failed" || event.type === "file") {
      // login problems name their target in the details; files belong to the reporting host
      const key = event.type === "file" ? `${event.host} ${event.details}` : event.details;
      if (alreadyLogged.has(key)) continue;
      alreadyLogged.add(key);
    }
    appendLog(ns, LOG_FILE, event.type, `${event.host}  ${event.details}`);
  }
}

/** One line for the sweep that is ending. @param {NS} ns */
function logSummary(ns) {
  const visitedData = ns.peek(DARKNET_VISITED_PORT);
  const reached = visitedData === "NULL PORT DATA" ? 0 : JSON.parse(visitedData).filter((/** @type {string} */ host) => host !== "home").length;
  const statusData = ns.peek(PHISHING_STATUS_PORT);
  const phishers = Object.values(statusData === "NULL PORT DATA" ? {} : JSON.parse(statusData));
  const sum = (/** @type {string} */ field) => phishers.reduce((total, status) => total + status[field], 0);
  appendLog(ns, LOG_FILE, "sweep", `${reached} darknet servers reached, ${phishers.length} phishing with ${sum("threads")} threads, `
    + `${sum("successes")}/${sum("attempts")} attempts successful, karma ${ns.getPlayer().karma.toFixed(0)}`);
}
