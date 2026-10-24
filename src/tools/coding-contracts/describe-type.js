// tools/coding-contracts/describe-type.js "<contract type>": creates a dummy contract of that type on home,
// writes the game's description and sample data to data/contract-description.txt, then deletes it.
/** @param {NS} ns */
export async function main(ns) {
  const type = String(ns.args[0] ?? "Largest Rectangle in a Matrix");
  const file = ns.codingcontract.createDummyContract(/** @type {any} */ (type), "home");
  if (!file) {
    ns.tprint(`could not create a dummy contract of type ${type}`);
    return;
  }
  const description = ns.codingcontract.getDescription(file, "home");
  const data = ns.codingcontract.getData(file, "home");
  ns.write("data/contract-description.txt", `${type}\n\n${description}\n\nSample data:\n${JSON.stringify(data)}\n`, "w");
  ns.rm(file, "home");
  ns.tprint(`description written to data/contract-description.txt`);
}
