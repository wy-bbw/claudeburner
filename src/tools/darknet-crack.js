import { appendLog } from "lib/log.js";

// darknet-crack.js: run on a darknet server (e.g. -h darkweb). For every directly connected darknet
// server without a session, guesses passwords from its model, hint and data, tries them with
// ns.dnet.authenticate, and on failure peeks at the server's logs (heartbleed) for feedback.
// Readable log: data/darknet-crack.txt (copied to home). Models are deliberately undocumented,
// so the guessers below are hypotheses that this tool tests.
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
    const candidates = guessPasswords(details);
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

/**
 * Password candidates for a darknet server, by model. Hypotheses, verified by authenticate().
 * @param {ReturnType<NS["dnet"]["getServerDetails"]>} details
 * @returns {string[]}
 */
function guessPasswords(details) {
  const hintNumbers = details.passwordHint.match(/\d+/g) ?? [];
  const dataDigits = (details.data.match(/\d/g) ?? []).join("");
  switch (details.modelId) {
    case "ZeroLogon": // "There is no password" / "The PIN is empty"
      return [""];
    case "DeskMemo_3.1": // "The key is 527": the hint states it
      return hintNumbers.filter((/** @type {string} */ number) => number.length === details.passwordLength);
    case "PHP 5.4": // "The PIN uses 237": some order of those digits
      return [...new Set(permutations((hintNumbers[0] ?? dataDigits).split("")).map((digits) => digits.join("")))];
    case "CloudBlare(tm)": // captcha: the digits hidden in the noise, in order
      return [dataDigits];
    default:
      return [];
  }
}

/** @template T @param {T[]} items @returns {T[][]} */
function permutations(items) {
  if (items.length <= 1) return [items];
  return items.flatMap((item, index) => permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [item, ...rest]));
}
