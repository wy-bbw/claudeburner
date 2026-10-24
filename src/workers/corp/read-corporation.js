// workers/corp/read-corporation.js: started by services/corp/status.js. One corporation call per script, because each
// costs 10 GB of RAM and home only fits one at a time: funds, revenue, valuation, divisions -> data/corp/corporation.txt
/** @param {NS} ns */
export async function main(ns) {
  ns.write("data/corp/corporation.txt", JSON.stringify(ns.corporation.getCorporation()), "w");
}
