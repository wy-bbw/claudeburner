// servers.js: every hacknet server/node (level, RAM, cores, cache, production), the player's hacknet multipliers
// and the stored hashes -> terminal and data/hacknet-servers.txt.
// Usage: run tools/hacknet/servers.js
/** @param {NS} ns */
export async function main(ns) {
  const multipliers = ns.getPlayer().mults;
  const lines = [
    `hacknet multipliers: production ${multipliers.hacknet_node_money}, purchase ${multipliers.hacknet_node_purchase_cost}, level ${multipliers.hacknet_node_level_cost}, ram ${multipliers.hacknet_node_ram_cost}, cores ${multipliers.hacknet_node_core_cost}`,
    `hashes ${ns.format.number(ns.hacknet.numHashes())}/${ns.format.number(ns.hacknet.hashCapacity())}, money $${ns.format.number(ns.getServerMoneyAvailable("home"))}`,
  ];
  let production = 0;
  for (let index = 0; index < ns.hacknet.numNodes(); index++) {
    const stats = ns.hacknet.getNodeStats(index);
    production += stats.production;
    lines.push(`${stats.name.padEnd(18)} level ${String(stats.level).padStart(3)}  ram ${String(stats.ram).padStart(5)}  cores ${String(stats.cores).padStart(3)}  cache ${stats.cache ?? "-"}  production ${ns.format.number(stats.production)}/s`);
  }
  lines.push(`total production ${ns.format.number(production)}/s`);
  ns.write("data/hacknet-servers.txt", lines.join("\n") + "\n", "w");
  ns.tprint("\n" + lines.join("\n"));
}
