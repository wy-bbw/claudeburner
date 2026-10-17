// Netscript port numbers shared between scripts.

/** The controller publishes its best hack-mode target here; the metrics sampler follows it. */
export const TARGET_PORT = 1;
/** Darknet crawlers send JSON events {type, host, details} here; services/darknet-orchestrator.js drains it into data/darknet.txt. */
export const DARKNET_EVENTS_PORT = 2;
/** The recorder keeps one message here: JSON {host: password} of every cracked darknet server. Read with peek. */
export const DARKNET_PASSWORDS_PORT = 3;
/** One message: JSON array of the darknet servers the current sweep (workers/darknet-crawl.js) has claimed. Read with peek. */
export const DARKNET_VISITED_PORT = 4;
/** One message: JSON {host: {threads, attempts, successes, last}} of every running workers/darknet-phish.js. Read with peek. */
export const PHISHING_STATUS_PORT = 5;
/** One message: JSON [{args, ok, error?}], the results of the corporation action worker that services/corp-manager-direct.js just ran. */
export const CORPORATION_ACTION_PORT = 6;
