// corp-read-investment.js: started by services/corp-status.js (one corporation call per script, 10 GB each):
// the current investment offer {funds, shares, round} -> data/corp/investment.txt
/** @param {NS} ns */
export async function main(ns) {
  ns.write("data/corp/investment.txt", JSON.stringify(ns.corporation.getInvestmentOffer()), "w");
}
