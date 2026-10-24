// workers/corp/read-research-status.js <JSON [{division, names}]>: started by services/corp/status.js (one corporation call per
// script, 10 GB each): which of the listed researches each division has -> data/corp/research-status.txt
/** @param {NS} ns */
export async function main(ns) {
  const requests = /** @type {{division: string, names: CorpResearchName[]}[]} */ (JSON.parse(String(ns.args[0])));
  const researchStatus = requests.map(({ division, names }) => ({
    division, researched: names.filter((name) => ns.corporation.hasResearched(division, name)),
  }));
  ns.write("data/corp/research-status.txt", JSON.stringify(researchStatus), "w");
}
