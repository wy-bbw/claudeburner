// Compares the game's growthAnalyze with our remembered grow formula, for
// targets currently at min security (where both should agree).
/** @param {NS} ns */
export async function main(ns) {
  ns.write("data/check-grow.txt", "", "w");
  for (const t of ns.args.map(String)) {
    const sec = ns.getServerSecurityLevel(t), min = ns.getServerMinSecurityLevel(t);
    const money = ns.getServerMoneyAvailable(t), max = ns.getServerMaxMoney(t);
    const growth = ns.getServerGrowth(t);
    const game = ns.growthAnalyze(t, max / Math.max(money, 1));
    const model = Math.log(max / Math.max(money, 1)) / Math.log(Math.min(1.0035, 1 + 0.03 / sec)) / (growth / 100);
    const line = `${t}: sec ${sec.toFixed(2)}/${min} money ${(100 * money / max).toFixed(1)}% growth ${growth} -> game ${game.toFixed(0)} model ${model.toFixed(0)} ratio ${(game / model).toFixed(3)}`;
    ns.tprint(line);
    ns.write("data/check-grow.txt", line + "\n", "a");
  }
}
