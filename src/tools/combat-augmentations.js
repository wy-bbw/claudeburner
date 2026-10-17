const OUTPUT_FILE = "data/combat-augmentations.txt";
const LEVEL_KEYS = /** @type {const} */ (["strength", "defense", "dexterity", "agility"]);
const EXP_KEYS = /** @type {const} */ (["strength_exp", "defense_exp", "dexterity_exp", "agility_exp"]);

// combat-augmentations.js (home, Singularity API): every augmentation you do not own yet that raises strength, defense,
// dexterity or agility (level multiplier) or their exp gain, from the factions you are in or are invited to.
// A level multiplier is worth far more than it looks: level = mult x (32 ln(exp + 534.5) - 200), so the exp needed for a
// level falls exponentially as the multiplier grows. Multipliers of different augmentations multiply.
// Columns: avg level bonus over the 4 stats, avg exp bonus, price, rep needed / rep you have in that faction, and
// "ready" when both are covered. Sorted by level bonus per million dollars. Also written to data/combat-augmentations.txt.
// Usage: run tools/combat-augmentations.js
/** @param {NS} ns */
export async function main(ns) {
  const player = ns.getPlayer();
  const owned = new Set(ns.singularity.getOwnedAugmentations(true));
  const factions = [...new Set([...player.factions, ...ns.singularity.checkFactionInvitations()])];
  /** @type {Map<string, {faction: string, price: number, repNeeded: number, repHave: number, levelBonus: number, expBonus: number, member: boolean}>} */
  const best = new Map();
  for (const faction of factions) {
    const repHave = ns.singularity.getFactionRep(faction);
    for (const name of ns.singularity.getAugmentationsFromFaction(faction)) {
      if (owned.has(name)) continue;
      const stats = ns.singularity.getAugmentationStats(name);
      const levelBonus = LEVEL_KEYS.reduce((sum, key) => sum + (stats[key] - 1), 0) / LEVEL_KEYS.length;
      const expBonus = EXP_KEYS.reduce((sum, key) => sum + (stats[key] - 1), 0) / EXP_KEYS.length;
      if (levelBonus <= 0 && expBonus <= 0) continue;
      const row = { faction, price: ns.singularity.getAugmentationPrice(name), repNeeded: ns.singularity.getAugmentationRepReq(name),
        repHave, levelBonus, expBonus, member: player.factions.includes(faction) };
      const known = best.get(name);
      // several factions can offer it: keep the one where you are closest to the rep
      if (!known || row.repNeeded - row.repHave < known.repNeeded - known.repHave) best.set(name, row);
    }
  }
  const rows = [...best.entries()].sort((a, b) => b[1].levelBonus / Math.max(b[1].price, 1e6) - a[1].levelBonus / Math.max(a[1].price, 1e6));
  const lines = rows.map(([name, row]) => {
    const ready = row.member && row.repHave >= row.repNeeded && player.money >= row.price;
    return `${name.padEnd(28)} lvl +${(row.levelBonus * 100).toFixed(0).padStart(3)}%  exp +${(row.expBonus * 100).toFixed(0).padStart(3)}%  `
      + `$${ns.format.number(row.price).padStart(8)}  rep ${ns.format.number(row.repNeeded).padStart(7)} / ${ns.format.number(row.repHave).padStart(7)}  `
      + `${row.faction}${row.member ? "" : " (invited, not joined)"}${ready ? "   <- ready" : ""}`;
  });
  const text = `combat augmentations not owned yet (level bonus per $ first). money $${ns.format.number(player.money)}\n${lines.join("\n")}\n`;
  ns.write(OUTPUT_FILE, text, "w");
  ns.tprint("\n" + text);
}
