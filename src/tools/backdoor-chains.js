import { pathTo, scanAll } from "lib/net.js";

// Servers whose backdoor gets a faction invite, or lowers a company faction's invite threshold by 25%.
const FACTION_SERVERS = ["CSEC", "avmnite-02h", "I.I.I.I", "run4theh111z", "w0r1d_d43m0n"];
const COMPANY_SERVERS = ["b-and-a", "clarkinc", "ecorp", "megacorp", "kuai-gong", "4sigma", "nwo", "blade", "omnitek", "fulcrumassets"];
const OUTPUT_FILE = "data/backdoor-chains.txt";

// backdoor-chains.js: a paste-ready terminal line for every server you can backdoor now (rooted, hacking level
// high enough, not your own, no backdoor yet): "home; connect a; connect b; backdoor". Faction servers first,
// then company servers, then the rest. Also written to data/backdoor-chains.txt.
// Scripts can't backdoor without Source-File 4 (ns.singularity.installBackdoor), so you paste the lines.
// Flags: --important (faction + company servers only)
//        --one-line (all chains joined into one line; untested whether the terminal waits for each backdoor)
/** @param {NS} ns */
export async function main(ns) {
  const options = ns.flags([["important", false], ["one-line", false]]);
  const parents = scanAll(ns);
  const hacking = ns.getHackingLevel();
  const priority = (/** @type {string} */ host) => FACTION_SERVERS.includes(host) ? 0 : COMPANY_SERVERS.includes(host) ? 1 : 2;

  const candidates = [...parents.keys()].filter((host) => {
    if (host === "home" || host === "darkweb") return false;
    const server = ns.getServer(host);
    return !server.purchasedByPlayer && server.hasAdminRights && !server.backdoorInstalled
      && (server.requiredHackingSkill ?? Infinity) <= hacking && (!options.important || priority(host) < 2);
  }).sort((a, b) => priority(a) - priority(b) || pathTo(parents, a).length - pathTo(parents, b).length);

  const chains = candidates.map((host) => `home; ${pathTo(parents, host).slice(1).map((hop) => `connect ${hop}`).join("; ")}; backdoor`);
  const lines = options["one-line"] && chains.length ? [chains.join("; ") + "; home"] : chains;
  ns.write(OUTPUT_FILE, lines.join("\n") + "\n", "w");
  if (!lines.length) {
    ns.tprint("Nothing to backdoor right now (everything rooted at your hacking level already has one).");
    return;
  }
  ns.tprint(`${candidates.length} servers to backdoor (also in ${OUTPUT_FILE}), important ones first:`);
  for (const line of lines) ns.tprint(line);
}
