// workers/corp/read-offices.js <JSON [{division, city}]>: started by services/corp/status.js (one corporation call per
// script, 10 GB each): employees per job, energy, morale -> data/corp/offices.txt
/** @param {NS} ns */
export async function main(ns) {
  const places = /** @type {{division: string, city: CityName}[]} */ (JSON.parse(String(ns.args[0])));
  const offices = places.map(({ division, city }) => ({ division, ...ns.corporation.getOffice(division, city) }));
  ns.write("data/corp/offices.txt", JSON.stringify(offices), "w");
}
