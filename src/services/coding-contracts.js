import { scanAll } from "lib/net.js";
import { CONTRACT_SOLVERS } from "lib/contract-solvers.js";

const TEST_RESULTS_FILE = "data/contract-tests.txt";
const LOG_FILE = "data/coding-contracts.txt";
const SCAN_INTERVAL_MS = 60_000;

// Finds coding contracts on every server and solves them for money / reputation.
// Only attempts types whose solver passed every dummy test (tools/test-contract-solvers.js),
// and stops using a type for good after one real failure, so a wrong solver can't burn contracts.
// Runs on home (reads the test results there). Log: data/coding-contracts.txt
/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  const toJson = (/** @type {any} */ value) => JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v));
  const log = (/** @type {object} */ entry) => ns.write(LOG_FILE, toJson({ time: Date.now(), ...entry }) + "\n", "a");

  const testResults = ns.read(TEST_RESULTS_FILE).split("\n").filter(Boolean).map((line) => JSON.parse(line)).filter((r) => r.type);
  const failedTypes = new Set(testResults.filter((r) => !r.passed).map((r) => r.type));
  const trustedTypes = new Set(testResults.filter((r) => r.passed && !failedTypes.has(r.type)).map((r) => r.type));
  log({ event: "start", trustedTypes: [...trustedTypes].length, untrusted: [...failedTypes] });

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
            log({ event: "skipped", host, file, type, reason: !solve ? "no solver" : blockedTypes.has(type) ? "blocked after failure" : "solver not verified" });
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
          log({ event: "solved", host, file, type, reward });
          ns.toast(`Contract solved: ${reward}`, "success", 10_000);
        } else {
          blockedTypes.add(type);
          log({ event: "FAILED", host, file, type, error, data, answer });
        }
      }
    }
    await ns.sleep(SCAN_INTERVAL_MS);
  }
}
