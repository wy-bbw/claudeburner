import { BOOST_MATERIALS } from "lib/corp-boosts.js";

// corp-read-boost-data.js <JSON list of industry names>: started by services/corp-manager.js (two corporation calls,
// 10 GB each): boost factors per industry and size + base cost per boost material -> data/corp/boost-data.txt
/** @param {NS} ns */
export async function main(ns) {
  const industries = /** @type {CorpIndustryName[]} */ (JSON.parse(String(ns.args[0])));
  const factors = Object.fromEntries(industries.map((industry) => {
    const data = ns.corporation.getIndustryData(industry);
    return [industry, { "Real Estate": data.realEstateFactor ?? 0, Hardware: data.hardwareFactor ?? 0, Robots: data.robotFactor ?? 0, "AI Cores": data.aiCoreFactor ?? 0 }];
  }));
  const materials = BOOST_MATERIALS.map((material) => ns.corporation.getMaterialData(material));
  const sizes = Object.fromEntries(materials.map((material) => [material.name, material.size]));
  const baseCosts = Object.fromEntries(materials.map((material) => [material.name, material.baseCost]));
  ns.write("data/corp/boost-data.txt", JSON.stringify({ factors, sizes, baseCosts }), "w");
}
