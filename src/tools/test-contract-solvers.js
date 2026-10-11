import { CONTRACT_SOLVERS } from "lib/contract-solvers.js";

const RESULTS_FILE = "data/contract-solver-test-results.txt";

// Tests every solver against dummy contracts (no reward) on this server and writes one JSON line
// per attempt to data/contract-solver-test-results.txt (machine-readable JSON; dummy contracts never pay a reward). services/coding-contracts.js only trusts types that passed.
// Usage: run tools/test-contract-solvers.js [rounds per type, default 3]
/** @param {NS} ns */
export async function main(ns) {
  const rounds = Number(ns.args[0] ?? 3);
  const host = ns.getHostname();
  const toJson = (/** @type {any} */ value) => JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v));
  ns.write(RESULTS_FILE, "", "w");
  const knownTypes = new Set(ns.codingcontract.getContractTypes());
  for (const [type, solve] of Object.entries(CONTRACT_SOLVERS)) {
    if (!knownTypes.has(/** @type {any} */ (type))) {
      ns.write(RESULTS_FILE, toJson({ type, passed: false, error: "type unknown to this game version" }) + "\n", "a");
      continue;
    }
    for (let round = 0; round < rounds; round++) {
      const file = ns.codingcontract.createDummyContract(/** @type {any} */ (type), host);
      if (!file) continue;
      const data = ns.codingcontract.getData(file, host);
      let answer, result = "", error = "";
      try {
        answer = solve(data);
        result = ns.codingcontract.attempt(answer, file, host);
      } catch (e) {
        error = String(e);
      }
      const passed = result !== "" && !error;
      ns.write(RESULTS_FILE, toJson({ type, passed, result, error, data, answer }).slice(0, 2000) + "\n", "a");
      if (ns.fileExists(file, host)) ns.rm(file, host);
    }
  }
  const missing = ns.codingcontract.getContractTypes().filter((type) => !(type in CONTRACT_SOLVERS));
  ns.write(RESULTS_FILE, toJson({ missingSolvers: missing }) + "\n", "a");
  ns.tprint(`contract solver tests written to ${RESULTS_FILE}`);
}
