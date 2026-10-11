// Resident on home. Executes commands the bridge writes to cmd/inbox.txt.
// A command may target another host; all .js files are copied there first,
// so heavy scripts can run on rooted servers instead of the tiny home.
const INBOX = "cmd/inbox.txt";
const SEQ = "data/agent-seq.txt";
const LOG = "data/agent-log.txt";

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  let last = Number(ns.read(SEQ)) || 0;
  let firstFail = 0; // when the head command first failed to start (usually: RAM busy)
  while (true) {
    const raw = ns.read(INBOX);
    let cmds = [];
    try { cmds = raw ? JSON.parse(raw) : []; } catch { /* partial write, retry next tick */ }
    for (const c of cmds) {
      if (c.seq <= last) continue;
      const host = c.host ?? "home";
      if (host !== "home") ns.scp(ns.ls("home", ".js"), host, "home");
      const pid = ns.exec(c.script, host, c.threads ?? 1, ...(c.args ?? []));
      if (pid === 0) {
        firstFail ||= Date.now();
        if (Date.now() - firstFail < 30000) break; // keep order, retry next tick
      }
      firstFail = 0;
      ns.write(LOG, JSON.stringify({ seq: c.seq, t: Date.now(), host, script: c.script, args: c.args, pid }) + "\n", "a");
      last = c.seq;
      ns.write(SEQ, String(last), "w");
    }
    await ns.sleep(500);
  }
}
