import { scanAll } from "lib/net.js";

// Dumps a full JSON snapshot of the game (player, every server, running scripts) to data/full-state.txt.
/** @param {NS} ns */
export async function main(ns) {
  const parents = scanAll(ns);
  const servers = [...parents.keys()].map((host) => {
    const s = ns.getServer(host);
    return {
      host,
      parent: parents.get(host),
      root: s.hasAdminRights,
      backdoor: s.backdoorInstalled,
      own: s.purchasedByPlayer,
      ram: s.maxRam,
      ramUsed: s.ramUsed,
      cores: s.cpuCores,
      ports: s.numOpenPortsRequired,
      reqHack: s.requiredHackingSkill,
      money: s.moneyAvailable,
      moneyMax: s.moneyMax,
      sec: s.hackDifficulty,
      secMin: s.minDifficulty,
      growth: s.serverGrowth,
      procs: ns.ps(host).map((p) => `${p.filename} t=${p.threads} ${p.args.join(" ")}`.trim()),
    };
  });
  const state = {
    time: Date.now(),
    player: ns.getPlayer(),
    programs: ns.ls("home", ".exe"),
    servers,
  };
  ns.write("data/full-state.txt", JSON.stringify(state), "w");
  ns.tprint(`state: ${servers.length} servers, $${ns.format.number(state.player.money)}`);
}
