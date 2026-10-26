// install-augmentations.js (home, Singularity API, ~82 GB at SF4.1): installs the purchased augmentations like the
// game's Install button, but through ns.singularity.installAugmentations, which also gives 15 Intelligence XP (the
// button gives none, game code v3.0.1). The game then starts --then on home by itself, 0.5 s after the reset, with no
// arguments and 1 thread, so you do not have to type it.
// The game refuses (and resets nothing) when no augmentation is queued.
// Usage: run tools/install-augmentations.js [--then <script on home>] (default start.js; start-corporation.js in
//        corporation BitNodes; "none" starts nothing) [--yes] (no confirmation dialog)
/** @param {NS} ns */
export async function main(ns) {
  const flags = ns.flags([["then", "start.js"], ["yes", false]]);
  const followUpScript = String(flags.then);
  if (followUpScript !== "none" && !ns.fileExists(followUpScript, "home")) {
    ns.tprint(`ERROR --then ${followUpScript} does not exist on home; nothing installed`);
    return;
  }
  const followUpText = followUpScript === "none" ? "nothing is started afterwards" : `${followUpScript} starts afterwards`;
  if (!flags.yes && !(await ns.prompt(`Install the purchased augmentations now? Money, stats and scripts reset; ${followUpText}.`))) {
    ns.tprint("cancelled, nothing installed");
    return;
  }
  // Kills every script, this one included, so nothing after this line runs on success.
  if (followUpScript === "none") ns.singularity.installAugmentations();
  else ns.singularity.installAugmentations(followUpScript);
  ns.tprint("nothing installed: no augmentation is queued (buy some first, e.g. run tools/buy-augmentations.js)");
}
