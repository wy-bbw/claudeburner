// Human-readable log lines: "2026-10-11 13:42:01  event  details".

/** Local date and time, e.g. "2026-10-11 13:42:01". @param {number} [time] epoch ms, default now */
export function formatTime(time = Date.now()) {
  const date = new Date(time);
  const pad = (/** @type {number} */ value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} `
    + `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/**
 * Appends one timestamped line to a log file on the current server.
 * @param {NS} ns @param {string} file @param {string} event @param {string} details
 */
export function appendLog(ns, file, event, details) {
  ns.write(file, `${formatTime()}  ${event.padEnd(8)}  ${details}\n`, "a");
}
