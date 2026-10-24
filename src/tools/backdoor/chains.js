import { backdoorCandidates } from "lib/backdoor.js";

const OUTPUT_FILE = "data/backdoor-chains.txt";

// tools/backdoor/chains.js: a paste-ready terminal line for every server you can backdoor now (lib/backdoor.js: rooted,
// hacking level high enough, not your own, no backdoor yet): "home; connect a; connect b; backdoor". Faction servers
// first, then company servers, then the rest. Also written to data/backdoor-chains.txt.
// With the Singularity API (BitNode 4 or Source-File 4) tools/backdoor/all.js does it by itself.
// Flags: --important (faction + company servers only)
//        --one-line (all chains joined into one line; untested whether the terminal waits for each backdoor)
/** @param {NS} ns */
export async function main(ns) {
  const options = ns.flags([["important", false], ["one-line", false]]);
  const candidates = backdoorCandidates(ns, Boolean(options.important));
  const chains = candidates.map(({ path }) => `home; ${path.slice(1).map((hop) => `connect ${hop}`).join("; ")}; backdoor`);
  const lines = options["one-line"] && chains.length ? [chains.join("; ") + "; home"] : chains;
  ns.write(OUTPUT_FILE, lines.join("\n") + "\n", "w");
  if (!lines.length) {
    ns.tprint("Nothing to backdoor right now (everything rooted at your hacking level already has one).");
    return;
  }
  ns.tprint(`${candidates.length} servers to backdoor (also in ${OUTPUT_FILE}), important ones first:`);
  for (const line of lines) ns.tprint(line);
}
