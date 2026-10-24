// Corporation-wide upgrade prices (game code): level n costs basePrice * priceMult^n.
export const UPGRADE_PRICES = {
  "Smart Factories": { basePrice: 2e9, priceMult: 1.06 },
  "Smart Storage": { basePrice: 2e9, priceMult: 1.06 },
  "Wilson Analytics": { basePrice: 4e9, priceMult: 2 },
  "Nuoptimal Nootropic Injector Implants": { basePrice: 1e9, priceMult: 1.06 },
  "Speech Processor Implants": { basePrice: 1e9, priceMult: 1.06 },
  "Neural Accelerators": { basePrice: 1e9, priceMult: 1.06 },
  "FocusWires": { basePrice: 1e9, priceMult: 1.06 },
  "ABC SalesBots": { basePrice: 1e9, priceMult: 1.07 },
  "Project Insight": { basePrice: 5e9, priceMult: 1.07 },
};
// Bought by tools/corp/upgrades.js: production, storage, employee stats (production, product rating, quality), RP.
// Not Wilson Analytics (services/corp/manager.js buys it with Advert) and not ABC SalesBots (products sell out anyway).
export const AUTO_UPGRADES = ["Smart Factories", "Smart Storage", "Neural Accelerators", "FocusWires",
  "Speech Processor Implants", "Nuoptimal Nootropic Injector Implants", "Project Insight"];

/** @param {string} name @param {number} level */
export function upgradeCost(name, level) {
  const price = UPGRADE_PRICES[/** @type {keyof typeof UPGRADE_PRICES} */ (name)];
  return price.basePrice * price.priceMult ** level;
}

/**
 * Spends `budget` level by level, always on the cheapest next level among `names`: upgrades with a low base price end
 * up a few levels higher, which roughly matches their value per dollar.
 * @param {Record<string, number>} levels current levels @param {string[]} names @param {number} budget
 * @returns {{levels: Record<string, number>, cost: number}} levels to buy per upgrade and their total cost
 */
export function planUpgrades(levels, names, budget) {
  const current = Object.fromEntries(names.map((name) => [name, levels[name] ?? 0]));
  /** @type {Record<string, number>} */
  const bought = {};
  let cost = 0;
  while (true) {
    const next = names.map((name) => ({ name, price: upgradeCost(name, current[name]) })).sort((a, b) => a.price - b.price)[0];
    if (!next || cost + next.price > budget) break;
    cost += next.price;
    current[next.name]++;
    bought[next.name] = (bought[next.name] ?? 0) + 1;
  }
  return { levels: bought, cost };
}
