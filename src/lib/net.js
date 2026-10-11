/**
 * BFS over the network.
 * @param {NS} ns
 * @returns {Map<string, string|null>} host -> parent (home -> null)
 */
export function scanAll(ns) {
  /** @type {Map<string, string|null>} */
  const parent = new Map([["home", null]]);
  const queue = ["home"];
  for (let host; (host = queue.shift()) !== undefined; ) {
    for (const next of ns.scan(host)) {
      if (!parent.has(next)) {
        parent.set(next, host);
        queue.push(next);
      }
    }
  }
  return parent;
}

/**
 * Path from home to host, for connect/backdoor.
 * @param {Map<string, string|null>} parents
 * @param {string} host
 */
export function pathTo(parents, host) {
  const path = [];
  for (let h = /** @type {string|null|undefined} */ (host); h; h = parents.get(h)) path.unshift(h);
  return path;
}
