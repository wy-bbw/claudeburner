// bitnode-status.js: current BitNode, owned source files, home RAM, money, hacking level and the BitNode
// multipliers -> terminal and data/bitnode-status.txt. ns.getBitNodeMultipliers needs SF5 or being in BitNode 5.
// Usage: run tools/bitnode-status.js
/** @param {NS} ns */
export async function main(ns) {
  const reset = ns.getResetInfo();
  const player = ns.getPlayer();
  const sourceFiles = [...reset.ownedSF].map(([number, level]) => `SF${number}.${level}`).join(" ");
  const lines = [
    `BitNode ${reset.currentNode}, source files ${sourceFiles}`,
    `home RAM ${ns.getServerMaxRam("home")} GB, money $${ns.format.number(player.money)}, hacking ${player.skills.hacking}`,
    `augmentations installed ${reset.ownedAugs.size}, since last install ${ns.format.time(Date.now() - reset.lastAugReset)}`,
  ];
  let multipliers = {};
  try {
    multipliers = ns.getBitNodeMultipliers();
  } catch (error) {
    lines.push(`no BitNode multipliers: ${error}`);
  }
  for (const [name, value] of Object.entries(multipliers)) if (value !== 1) lines.push(`${name} ${value}`);
  for (const line of lines) ns.tprint(line);
  ns.write("data/bitnode-status.txt", lines.join("\n") + "\n", "w");
}
