const NEUROFLUX = "NeuroFlux Governor";
/** @typedef {ReturnType<NS["getPlayer"]>["factions"][number]} FactionName */

// buy-augmentations.js (home, Singularity API): buys every augmentation you can afford from the factions you are a member
// of, then NeuroFlux Governor levels until money or faction rep runs out. Install afterwards with
// tools/install-augmentations.js (+15 Intelligence XP over the Install button). Each purchase gives 15 Intelligence XP too.
// Order: each purchase raises the price of every later one (x1.9 per augmentation), so the most expensive affordable
// augmentation goes first; an augmentation waits until its prerequisites are owned or bought. Each augmentation is bought
// from the member faction with the most rep. NeuroFlux comes last because its price and rep requirement grow per level.
// Usage: run tools/buy-augmentations.js [--dry-run] (lists what is buyable now at current prices, buys nothing)
//        [--no-neuroflux] [--keep <dollars>] (money that stays untouched)
/** @param {NS} ns */
export async function main(ns) {
  const flags = ns.flags([["dry-run", false], ["no-neuroflux", false], ["keep", 0]]);
  const dryRun = /** @type {boolean} */ (flags["dry-run"]);
  const keepMoney = Number(flags.keep);
  const memberFactions = ns.getPlayer().factions;
  /** @type {Map<string, number>} */
  const repByFaction = new Map(memberFactions.map((faction) => [faction, ns.singularity.getFactionRep(faction)]));
  /** @type {Map<string, FactionName[]>} augmentation -> member factions that offer it */
  const factionsByAugmentation = new Map();
  for (const faction of memberFactions) {
    for (const name of ns.singularity.getAugmentationsFromFaction(faction)) {
      factionsByAugmentation.set(name, [...(factionsByAugmentation.get(name) ?? []), faction]);
    }
  }
  const ownedOrBought = new Set(ns.singularity.getOwnedAugmentations(true));
  const spendable = () => ns.getServerMoneyAvailable("home") - keepMoney;
  /** @param {string} name only augmentations that a member faction offers */
  const bestFaction = (name) => /** @type {FactionName[]} */ (factionsByAugmentation.get(name))
    .reduce((best, faction) => ((repByFaction.get(faction) ?? 0) > (repByFaction.get(best) ?? 0) ? faction : best));
  /** @param {string} name */
  const describe = (name, faction = bestFaction(name)) => `${name} from ${faction} for $${ns.format.number(ns.singularity.getAugmentationPrice(name))}`
    + ` (rep ${ns.format.number(ns.singularity.getAugmentationRepReq(name))} / ${ns.format.number(repByFaction.get(faction) ?? 0)})`;

  const bought = [];
  const remaining = [...factionsByAugmentation.keys()].filter((name) => name !== NEUROFLUX && !ownedOrBought.has(name));
  while (true) {
    const buyable = remaining
      .filter((name) => !ownedOrBought.has(name))
      .filter((name) => ns.singularity.getAugmentationPrereq(name).every((prerequisite) => ownedOrBought.has(prerequisite)))
      .filter((name) => (repByFaction.get(bestFaction(name)) ?? 0) >= ns.singularity.getAugmentationRepReq(name))
      .filter((name) => ns.singularity.getAugmentationPrice(name) <= spendable())
      .sort((a, b) => ns.singularity.getAugmentationPrice(b) - ns.singularity.getAugmentationPrice(a));
    if (buyable.length === 0) break;
    if (dryRun) {
      ns.tprint(`buyable now (most expensive first, prices rise x1.9 per purchase):\n${buyable.map((name) => "  " + describe(name)).join("\n")}`);
      break;
    }
    const name = buyable[0];
    const line = describe(name);
    if (!ns.singularity.purchaseAugmentation(bestFaction(name), name)) {
      ns.tprint(`FAILED ${line}`);
      remaining.splice(remaining.indexOf(name), 1);
      continue;
    }
    ownedOrBought.add(name);
    bought.push(line);
  }

  let neurofluxLevels = 0;
  const neurofluxFaction = factionsByAugmentation.has(NEUROFLUX) ? bestFaction(NEUROFLUX) : undefined;
  if (!flags["no-neuroflux"] && neurofluxFaction && !dryRun) {
    while (ns.singularity.getAugmentationPrice(NEUROFLUX) <= spendable()
      && (repByFaction.get(neurofluxFaction) ?? 0) >= ns.singularity.getAugmentationRepReq(NEUROFLUX)) {
      const line = describe(NEUROFLUX, neurofluxFaction);
      if (!ns.singularity.purchaseAugmentation(neurofluxFaction, NEUROFLUX)) break;
      neurofluxLevels++;
      bought.push(line);
    }
  }

  const missing = remaining.filter((name) => !ownedOrBought.has(name)).map((name) => "  " + describe(name));
  ns.tprint([
    dryRun ? "dry run, nothing bought" : `bought ${bought.length} (${neurofluxLevels} NeuroFlux levels):`,
    ...bought.map((line) => "  " + line),
    missing.length > 0 ? `not bought (money, rep or prerequisites):\n${missing.join("\n")}` : "every faction augmentation is owned or bought",
    !neurofluxFaction ? "no member faction offers NeuroFlux Governor"
      : `next NeuroFlux: ${describe(NEUROFLUX, neurofluxFaction)}`,
    `money left $${ns.format.number(ns.getServerMoneyAvailable("home"))}`,
  ].join("\n"));
}
