// Employee upkeep: production is multiplied by energy x morale. Tea gives +2 energy at the next cycle; a party sets
// morale = (morale + 10 * (m - 1)) * m with m = 1 + costPerEmployee / 1e7 (game code). This is what the AutoBrew and
// AutoPartyManager research do, without spending RP.

/** Tea / party when energy or morale is this far below the maximum. */
const TOP_UP_MARGIN = 2;

/**
 * @typedef {{division: string, city: CityName, numEmployees: number, avgEnergy: number, maxEnergy: number,
 *   avgMorale: number, maxMorale: number}} OfficeData (workers/corp-read-offices.js)
 */

/**
 * Tea for tired offices and parties (sized to reach the maximum morale) for unhappy ones.
 * @param {OfficeData[]} offices
 * @returns {{teaCalls: unknown[][], partyCalls: unknown[][]}} arguments for workers/corp-do-buy-tea.js and corp-do-throw-party.js
 */
export function upkeepCalls(offices) {
  const staffed = offices.filter((office) => office.numEmployees > 0);
  const teaCalls = staffed.filter((office) => office.avgEnergy < office.maxEnergy - TOP_UP_MARGIN)
    .map((office) => [office.division, office.city]);
  const partyCalls = staffed.filter((office) => office.avgMorale < office.maxMorale - TOP_UP_MARGIN)
    .map((office) => [office.division, office.city, Math.ceil((office.maxMorale / office.avgMorale - 1) * 1e7)]);
  return { teaCalls, partyCalls };
}
