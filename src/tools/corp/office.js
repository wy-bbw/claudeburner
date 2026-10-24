// tools/corp/office.js: asks services/corp/manager.js to grow offices, hire up to the new size and split the jobs
// (lib/corp-offices.js: ceil(size / 9) interns, the rest by --jobs weights). Queued in data/corp-requests.txt; the
// manager logs the result in data/corp-manager.txt.
//   --city <name> or "all" (every city of the division)       --size N: target size per office
//   --budget-fraction f instead of --size: the largest size the share of funds buys, split evenly over the cities
//   --jobs "Operations:4,Engineer:22,Business:8,Management:24,Research & Development:0" weights (default: keep each
//     office's current split; equal Operations/Engineer/Business/Management for an empty office)
//   --dry-run only logs the plan
// Usage: run tools/corp/office.js --division tobacco --city Aevum --budget-fraction 0.3
/** @param {NS} ns */
export async function main(ns) {
  const flags = ns.flags([["division", "tobacco"], ["city", "all"], ["size", 0], ["budget-fraction", 0], ["jobs", ""], ["dry-run", false]]);
  const jobs = String(flags.jobs) ? Object.fromEntries(String(flags.jobs).split(",").map((pair) => {
    const [job, weight] = pair.split(":");
    return [job.trim(), Number(weight)];
  })) : null;
  if (!Number(flags.size) && !Number(flags["budget-fraction"])) {
    ns.tprint("give --size or --budget-fraction");
    return;
  }
  const request = {
    type: "office", division: String(flags.division), city: String(flags.city), size: Number(flags.size),
    budgetFraction: Number(flags["budget-fraction"]), jobs, dryRun: Boolean(flags["dry-run"]), time: Date.now(),
  };
  ns.write("data/corp-requests.txt", JSON.stringify(request) + "\n", "a");
  ns.tprint(`queued: ${JSON.stringify(request)} (services/corp/manager.js runs it within ~30 s, see data/corp-manager.txt)`);
}
