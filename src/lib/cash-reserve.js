// Cash that scripts set aside for themselves, so that spenders (services/hacknet/manager.js) leave it alone.
// data/cash-reserves.txt holds {owner: dollars}; every owner sets and clears only its own entry (clear it in
// ns.atExit, or a killed script keeps its money blocked).
const RESERVES_FILE = "data/cash-reserves.txt";

/** @param {NS} ns @returns {Record<string, number>} */
function readReserves(ns) {
  try {
    return JSON.parse(ns.read(RESERVES_FILE) || "{}");
  } catch {
    return {};
  }
}

/** Sets this owner's reservation; 0 or less removes it. @param {NS} ns @param {string} owner @param {number} amount */
export function setCashReserve(ns, owner, amount) {
  const reserves = readReserves(ns);
  if (amount > 0) reserves[owner] = amount;
  else delete reserves[owner];
  ns.write(RESERVES_FILE, JSON.stringify(reserves), "w");
}

/** All reservations together, in dollars. @param {NS} ns */
export function reservedCash(ns) {
  return Object.values(readReserves(ns)).reduce((sum, amount) => sum + Number(amount), 0);
}
