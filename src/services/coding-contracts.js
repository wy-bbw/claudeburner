import { scanAll } from "lib/net.js";
import { CONTRACT_SOLVERS } from "lib/contract-solvers.js";
import { appendLog } from "lib/log.js";

const TEST_RESULTS_FILE = "data/contract-tests.txt";
const LOG_FILE = "data/coding-contracts.txt";
const SCAN_INTERVAL_MS = 60_000;

// Finds coding contracts on every server and solves them for money / reputation.
// Only attempts types whose solver passed every dummy test (tools/test-contract-solvers.js),
// and stops using a type for good after one real failure, so a wrong solver can't burn contracts.
// Runs on home (reads the test results there). Log (readable lines): data/coding-contracts.txt
/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  const toJson = (/** @type {any} */ value) => JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v));
  const log = (/** @type {string} */ event, /** @type {string} */ details) => appendLog(ns, LOG_FILE, event, details);

  const testResults = ns.read(TEST_RESULTS_FILE).split("\n").filter(Boolean).map((line) => JSON.parse(line)).filter((r) => r.type);
  const failedTypes = new Set(testResults.filter((r) => !r.passed).map((r) => r.type));
  const trustedTypes = new Set(testResults.filter((r) => r.passed && !failedTypes.has(r.type)).map((r) => r.type));
  log("start", `${trustedTypes.size} verified solver types${failedTypes.size ? `, unverified: ${[...failedTypes].join(", ")}` : ""}`);

  /** @type {Set<string>} */
  const blockedTypes = new Set();
  /** @type {Set<string>} */
  const reportedUnsolvable = new Set();

  while (true) {
    for (const host of scanAll(ns).keys()) {
      for (const file of ns.ls(host, ".cct")) {
        const type = ns.codingcontract.getContractType(file, host);
        const solve = CONTRACT_SOLVERS[type];
        if (!solve || !trustedTypes.has(type) || blockedTypes.has(type)) {
          const key = `${host}/${file}`;
          if (!reportedUnsolvable.has(key)) {
            reportedUnsolvable.add(key);
            const reason = !solve ? "no solver" : blockedTypes.has(type) ? "blocked after a failure" : "solver not verified";
            log("skipped", `${type} on ${host} (${file}): ${reason}`);
          }
          continue;
        }
        const data = ns.codingcontract.getData(file, host);
        let answer, reward = "", error = "";
        try {
          answer = solve(data);
          reward = ns.codingcontract.attempt(answer, file, host);
        } catch (e) {
          error = String(e);
        }
        if (reward) {
          log("solved", `${type} on ${host}: ${reward}`);
          ns.toast(`Contract solved: ${reward}`, "success", 10_000);
        } else {
          blockedTypes.add(type);
          log("FAILED", `${type} on ${host} (${file})${error ? `: ${error}` : ""} | data ${toJson(data)} | answer ${toJson(answer)}`);
        }
      }
    }
    await ns.sleep(SCAN_INTERVAL_MS);
  }
}
