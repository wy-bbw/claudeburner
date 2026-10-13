import { passwordCandidates } from "lib/darknet-models.js";
import { DARKNET_EVENTS_PORT, DARKNET_VISITED_PORT, PHISHING_STATUS_PORT } from "lib/ports.js";

const CRAWLER = "workers/darknet-crawl.js";
const PHISHER = "workers/darknet-phish.js";
const FILES_TO_SPREAD = [CRAWLER, PHISHER, "lib/darknet-models.js", "lib/ports.js"];
// Phisher of the hand-run version (run_darknet.js); killed too until the servers it ran on have restarted.
const OLD_PHISHER = "darknet_phishing.js";
// Passed to the copies on other servers, so only the root of a sweep resets the visited list.
const CHILD_FLAG = "--child";

// darknet-crawl.js: one sweep through the darknet, one copy per server. Each copy
//   1. opens the .cache files on its server (phishing occasionally leaves one) and logs the text of other
//      files there (possible password hints; failed logins also list the target's files),
//   2. logs in to every connected darknet server this sweep hasn't claimed (lib/darknet-models.js passwords),
//   3. copies itself there and starts the copy, after killing the phisher an earlier sweep left there,
//   4. on darknet servers (every copy but the root): turns into the phisher with all the server's RAM.
// The root is started by services/darknet-orchestrator.js on home every few minutes, or by hand.
// Claimed servers: DARKNET_VISITED_PORT; read and write happen without an await in between, so two
// copies cannot claim the same server. Events go to DARKNET_EVENTS_PORT (the orchestrator logs them).
/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  const here = ns.getHostname();
  const isChild = ns.args[0] === CHILD_FLAG;
  /** @param {string} type @param {string} details */
  const report = (type, details) => ns.writePort(DARKNET_EVENTS_PORT, JSON.stringify({ type, host: here, details }));

  if (!isChild && !ns.fileExists("DarkscapeNavigator.exe", "home")) {
    ns.tprint("darknet-crawl.js needs DarkscapeNavigator.exe (buy it through TOR): every dnet call throws without it");
    return;
  }
  if (!isChild) {
    ns.clearPort(DARKNET_VISITED_PORT);
    // running phishers re-add themselves after their next attempt; servers that left the darknet drop out
    ns.clearPort(PHISHING_STATUS_PORT);
  }
  claimServer(ns, here);
  openCaches(ns, report);
  if (here !== "home") reportFiles(ns, report);

  // authenticate() gives this script a session, which scp and exec need
  const loggedIn = [];
  for (const host of ns.dnet.probe()) {
    if (visitedServers(ns).includes(host)) continue;
    if (await tryLogin(ns, host, report)) loggedIn.push(host);
  }

  for (const host of loggedIn) {
    if (!claimServer(ns, host)) continue; // another copy got there first
    if (!ns.scp(FILES_TO_SPREAD, host)) {
      report("error", `could not copy the crawler to ${host}`);
      continue;
    }
    // a phisher from an earlier sweep fills the RAM; the new crawler turns back into one when it is done
    ns.kill(PHISHER, host);
    ns.kill(OLD_PHISHER, host);
    if (!ns.exec(CRAWLER, host, 1, CHILD_FLAG)) report("error", `could not start the crawler on ${host} (not enough RAM?)`);
  }

  if (isChild) startPhishing(ns, report);
}

/** @param {NS} ns @returns {string[]} */
function visitedServers(ns) {
  const data = ns.peek(DARKNET_VISITED_PORT);
  return data === "NULL PORT DATA" ? [] : JSON.parse(data);
}

/** Marks the server as visited in this sweep; false if it already was. @param {NS} ns @param {string} host */
function claimServer(ns, host) {
  const visited = visitedServers(ns);
  if (visited.includes(host)) return false;
  visited.push(host);
  ns.clearPort(DARKNET_VISITED_PORT);
  ns.writePort(DARKNET_VISITED_PORT, JSON.stringify(visited));
  return true;
}

/**
 * Tries every password candidate; true once one works.
 * @param {NS} ns @param {string} host @param {(type: string, details: string) => void} report
 */
async function tryLogin(ns, host, report) {
  const details = ns.dnet.getServerDetails(host);
  const candidates = passwordCandidates(details);
  const description = `${details.modelId}, hint ${JSON.stringify(details.passwordHint)}, data ${JSON.stringify(details.data)}, `
    + `${details.passwordLength} ${details.passwordFormat} characters, files ${JSON.stringify(foreignFiles(ns, host))}`;
  /** How the server answers a wrong password; some models give feedback (see partial-password-jutsu.lit). */
  const answer = (/** @type {DarknetResult & { data?: any }} */ result) => JSON.stringify({ code: result.code, message: result.message, data: result.data });
  if (!candidates.length) {
    // some servers report passwordLength -1 (unknown length)
    const wrongTry = await ns.dnet.authenticate(host, (details.passwordFormat === "numeric" ? "0" : "a").repeat(Math.max(1, details.passwordLength)));
    report("unknown", `${host}: no password guess (${description}); a wrong password gets ${answer(wrongTry)}, `
      + `its logs say ${JSON.stringify(await serverLogs(ns, host))}`);
    return wrongTry.success;
  }
  let firstResult, result;
  for (const password of candidates) {
    result = await ns.dnet.authenticate(host, password);
    if (result.success) return true;
    firstResult ??= result;
  }
  report("failed", `${host}: tried ${JSON.stringify(candidates)} (${description}); `
    + `the first try got ${answer(/** @type {DarknetResult} */ (firstResult))}, the last ${answer(/** @type {DarknetResult} */ (result))}, `
    + `its logs say ${JSON.stringify(await serverLogs(ns, host))}`);
  return false;
}

/**
 * The target's newest log lines, left in place (peek): servers log feedback on login attempts there.
 * Fails on servers that need more charisma than the player has.
 * @param {NS} ns @param {string} host
 */
async function serverLogs(ns, host) {
  const result = await ns.dnet.heartbleed(host, { peek: true, logsToCapture: 5 });
  return result.success ? result.logs : [`heartbleed failed: ${result.code} ${result.message}`];
}

/** Files we didn't put there (no scripts, caches or programs): candidates for password hints. @param {NS} ns @param {string} host */
function foreignFiles(ns, host) {
  return ns.ls(host).filter((file) => !/\.(js|cache|exe)$/.test(file));
}

/** Logs the text of every foreign file on this server (ns.read only reads the own server). @param {NS} ns @param {(type: string, details: string) => void} report */
function reportFiles(ns, report) {
  for (const file of foreignFiles(ns, ns.getHostname())) {
    const text = ns.read(file).replace(/\s+/g, " ").trim();
    report("file", `${file}: ${text.slice(0, 500) || "(empty or not text)"}`);
  }
}

/** openCache only works on the script's own server. @param {NS} ns @param {(type: string, details: string) => void} report */
function openCaches(ns, report) {
  for (const cacheFile of ns.ls(ns.getHostname(), ".cache")) {
    const result = ns.dnet.openCache(cacheFile, true); // no toast: the log has it
    if (result.success) report("cache", `${cacheFile}: ${result.message} (karma ${result.karmaLoss})`);
    else report("error", `could not open ${cacheFile}: ${result.message}`);
  }
}

/**
 * Replaces this crawler with the phisher at as many threads as fit; spawn frees the crawler's RAM first.
 * @param {NS} ns @param {(type: string, details: string) => void} report
 */
function startPhishing(ns, report) {
  const here = ns.getHostname();
  const freeRam = ns.getServerMaxRam(here) - ns.getServerUsedRam(here) + ns.getScriptRam(CRAWLER, here);
  const threads = Math.floor(freeRam / ns.getScriptRam(PHISHER, here));
  if (threads < 1) {
    report("error", `not enough RAM to phish (${freeRam.toFixed(1)} GB free)`);
    return;
  }
  ns.spawn(PHISHER, { threads, spawnDelay: 0 });
}
