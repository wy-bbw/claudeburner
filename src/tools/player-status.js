// player-status.js: the numbers faction invites check - karma, kills, hacking and combat stats, money, city, installed
// augmentations (NeuroFlux counts once, like the game's Daedalus check) -> terminal and data/player-status.txt.
// Usage: run tools/player-status.js
/** @param {NS} ns */
export async function main(ns) {
  const player = ns.getPlayer();
  const installed = ns.getResetInfo().ownedAugs;
  const { hacking, strength, defense, dexterity, agility, charisma } = player.skills;
  const lines = [
    `karma ${player.karma.toFixed(1)}, people killed ${player.numPeopleKilled}`,
    `hacking ${hacking}, combat str ${strength} / def ${defense} / dex ${dexterity} / agi ${agility}, charisma ${charisma}`,
    `money $${ns.format.number(player.money)}, city ${player.city}`,
    `augmentations installed ${installed.size} (NeuroFlux level ${installed.get("NeuroFlux Governor") ?? 0} counts once)`,
  ];
  for (const line of lines) ns.tprint(line);
  ns.write("data/player-status.txt", lines.join("\n") + "\n", "w");
}
