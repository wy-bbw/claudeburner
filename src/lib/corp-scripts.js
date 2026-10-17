import { CORPORATION_ACTION_PORT } from "lib/ports.js";

// Runs corporation worker scripts on home. Every corporation call costs 10 GB (reads) or 20 GB (actions), so each
// call lives in its own small script (workers/corp-read-*.js, workers/corp-do-*.js) and home runs one at a time.
// Several services share home's free RAM: when a script does not fit yet, wait and try again.

const WAIT_REPORT_MS = 60_000;

/**
 * Starts a corporation worker on home, waits until it has finished and returns the JSON it wrote to outputFile.
 * @param {NS} ns @param {string} script @param {string} outputFile @param {string[]} args
 */
export async function runCorporationScript(ns, script, outputFile, args) {
  const needed = ns.getScriptRam(script, "home");
  if (needed > ns.getServerMaxRam("home")) throw new Error(`${script} needs ${needed} GB, more than home has`);
  const waitStart = Date.now();
  let reported = false;
  let pid = 0;
  while (!(pid = ns.run(script, 1, ...args))) {
    if (!reported && Date.now() - waitStart > WAIT_REPORT_MS) {
      ns.print(`still waiting for ${needed} GB free on home to start ${script}`);
      reported = true;
    }
    await ns.sleep(200);
  }
  while (ns.isRunning(pid)) await ns.sleep(50);
  return JSON.parse(ns.read(outputFile));
}

/** Reader workers write data/corp/<name>.txt. @param {NS} ns @param {string} name @param {string[]} args */
export function runReader(ns, name, args) {
  return runCorporationScript(ns, `workers/corp-read-${name}.js`, `data/corp/${name}.txt`, args);
}

/**
 * Action workers take a JSON list of argument lists (one call each) and write [{args, ok, error?}] to
 * data/corp/do-<action>.txt.
 * @param {NS} ns @param {string} action @param {unknown[][]} calls
 * @returns {Promise<{args: unknown[], ok: boolean, error?: string}[]>}
 */
export function runAction(ns, action, calls) {
  return runCorporationScript(ns, `workers/corp-do-${action}.js`, `data/corp/do-${action}.txt`, [JSON.stringify(calls)]);
}

/**
 * Like runAction, but the worker answers through a port, not a file (used with the in-process readers of lib/corp-direct.js).
 * @param {NS} ns @param {string} action @param {unknown[][]} calls
 * @returns {Promise<{args: unknown[], ok: boolean, error?: string}[]>}
 */
export async function runActionByPort(ns, action, calls) {
  const script = `workers/corp-do-${action}.js`;
  const needed = ns.getScriptRam(script, "home");
  if (needed > ns.getServerMaxRam("home")) throw new Error(`${script} needs ${needed} GB, more than home has`);
  ns.clearPort(CORPORATION_ACTION_PORT);
  let pid = 0;
  while (!(pid = ns.run(script, 1, JSON.stringify(calls), CORPORATION_ACTION_PORT))) await ns.sleep(200);
  while (ns.isRunning(pid)) await ns.sleep(50);
  const answer = ns.readPort(CORPORATION_ACTION_PORT);
  if (answer === "NULL PORT DATA") throw new Error(`${script} gave no answer`);
  return JSON.parse(String(answer));
}
