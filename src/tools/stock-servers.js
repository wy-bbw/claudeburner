import { stockServers } from "lib/stock-servers.js";

// stock-servers.js: every stock symbol with its company's server: required hacking level, root access, max money,
// growth, the largest position you can hold (max shares x price), and whether you can grow it now (the condition for moving the stock with grow(host, {stock: true})).
// Growable ones first. -> terminal and data/stock-servers.txt.
// Usage: run tools/stock-servers.js
/** @param {NS} ns */
export async function main(ns) {
  const level = ns.getHackingLevel();
  const rows = [...stockServers(ns)].map(([symbol, host]) => {
    const server = ns.getServer(host);
    const requiredLevel = server.requiredHackingSkill ?? 0;
    return { symbol, host, requiredLevel, root: server.hasAdminRights, maxMoney: server.moneyMax ?? 0,
      growth: server.serverGrowth ?? 0, maxPosition: ns.stock.getMaxShares(symbol) * ns.stock.getPrice(symbol), growable: server.hasAdminRights && requiredLevel <= level && (server.moneyMax ?? 0) > 0 };
  }).sort((a, b) => Number(b.growable) - Number(a.growable) || a.requiredLevel - b.requiredLevel);
  const lines = [`hacking level ${level}; symbol, server, required level, root, max money, growth, largest position`];
  for (const row of rows) {
    lines.push(`${row.growable ? "GROW " : "     "}${row.symbol.padEnd(5)} ${row.host.padEnd(20)} level ${String(row.requiredLevel).padStart(4)}  `
      + `${row.root ? "root   " : "no root"}  $${ns.format.number(row.maxMoney).padStart(9)}  growth ${String(row.growth).padStart(2)}  `
      + `position up to $${ns.format.number(row.maxPosition)}`);
  }
  ns.write("data/stock-servers.txt", lines.join("\n") + "\n", "w");
  ns.tprint("\n" + lines.join("\n"));
}
