import { passwordCandidates } from "lib/darknet-models.js";
import { appendLog } from "lib/log.js";

// darknet-crack.js: run on a darknet server (e.g. -h darkweb). For every directly connected darknet
// server without a session, guesses passwords from its hint and model (lib/darknet-models.js), tries them with
// ns.dnet.authenticate, and on failure peeks at the server's logs (heartbleed) for feedback.
// Readable log: data/darknet-crack.txt (copied to home). Models are deliberately undocumented,
// so the guessers are hypotheses that this tool tests.
/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  const here = ns.getHostname();
  const logFile = "data/darknet-crack.txt";
  const log = (/** @type {string} */ event, /** @type {string} */ details) => appendLog(ns, logFile, event, details);

  for (const host of ns.dnet.probe()) {
    const details = ns.dnet.getServerDetails(host);
    if (details.hasSession) {
      log("known", `${host} (${details.modelId}): already have a session`);
      continue;
    }
    const candidates = passwordCandidates(details);
    if (!candidates.length) {
      log("unknown", `${host}: no guesser for model ${details.modelId} | hint ${JSON.stringify(details.passwordHint)} | data ${JSON.stringify(details.data)} | ${details.passwordFormat}, length ${details.passwordLength}`);
      continue;
    }
    let cracked = false;
    for (const password of candidates) {
      const result = await ns.dnet.authenticate(host, password);
      if (result.success) {
        log("CRACKED", `${host} (${details.modelId}) with ${JSON.stringify(password)}${result.data !== undefined ? ` | data ${JSON.stringify(result.data)}` : ""}`);
        cracked = true;
        break;
      }
      log("wrong", `${host} (${details.modelId}) ${JSON.stringify(password)}: ${result.code} ${result.message}`);
    }
    if (!cracked) {
      const feedback = await ns.dnet.heartbleed(host, { peek: true, logsToCapture: 5 });
      log("feedback", `${host}: ${JSON.stringify(feedback.logs)}`);
    }
  }
  if (here !== "home") ns.scp(logFile, "home", here);
}

