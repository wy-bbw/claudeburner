import { scanAll } from "lib/net.js";

/**
 * The server of every listed company (stock symbol -> hostname), matched by the server's organization name.
 * grow(host, {stock: true}) on it can raise that stock's forecast, hack(host, {stock: true}) can lower it.
 * Symbols without a server on the network are left out.
 * @param {NS} ns
 * @returns {Map<string, string>}
 */
export function stockServers(ns) {
  /** @type {Map<string, string>} */
  const hostByOrganization = new Map();
  for (const host of scanAll(ns).keys()) {
    const organization = ns.getServer(host).organizationName;
    if (organization) hostByOrganization.set(organization, host);
  }
  /** @type {Map<string, string>} */
  const servers = new Map();
  for (const symbol of ns.stock.getSymbols()) {
    const host = hostByOrganization.get(ns.stock.getOrganization(symbol));
    if (host) servers.set(symbol, host);
  }
  return servers;
}
