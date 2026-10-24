// Shared body of the corporation action workers (workers/corp/do-*.js). Kept apart from lib/corp-scripts.js so the
// workers do not pay RAM for the runner's ns.run / ns.isRunning.

/**
 * Runs one corporation call per argument list from ns.args[0] (JSON) and writes [{args, ok, error?}] to
 * data/corp/do-<action>.txt, or, when ns.args[1] is a port number, to that port (no file; lib/corp-scripts.js runActionByPort).
 * @param {NS} ns @param {string} action @param {(args: any[]) => void} call
 */
export function performCalls(ns, action, call) {
  const calls = /** @type {any[][]} */ (JSON.parse(String(ns.args[0])));
  const results = calls.map((args) => {
    try {
      call(args);
      return { args, ok: true };
    } catch (error) {
      return { args, ok: false, error: String(error) };
    }
  });
  const port = Number(ns.args[1]);
  if (port) ns.writePort(port, JSON.stringify(results));
  else ns.write(`data/corp/do-${action}.txt`, JSON.stringify(results), "w");
}
