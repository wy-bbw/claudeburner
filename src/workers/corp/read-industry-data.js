import { BOOST_MATERIALS } from "lib/corp-boosts.js";

// workers/corp/read-industry-data.js <JSON list of industry names>: started by services/corp/manager.js (two corporation calls,
// 10 GB each): per industry the boost factors, science factor, required and produced materials; per boost material its size and base
// cost and base markup (also for the required and produced materials) -> data/corp/industry-data.txt
/** @param {NS} ns */
export async function main(ns) {
  const industries = /** @type {CorpIndustryName[]} */ (JSON.parse(String(ns.args[0])));
  const byIndustry = Object.fromEntries(industries.map((industry) => {
    const data = ns.corporation.getIndustryData(industry);
    return [industry, {
      factors: { "Real Estate": data.realEstateFactor ?? 0, Hardware: data.hardwareFactor ?? 0, Robots: data.robotFactor ?? 0, "AI Cores": data.aiCoreFactor ?? 0 },
      requiredMaterials: data.requiredMaterials, producedMaterials: data.producedMaterials ?? [], makesProducts: data.makesProducts,
      scienceFactor: data.scienceFactor ?? 0, advertisingFactor: data.advertisingFactor ?? 0, startingCost: data.startingCost,
    }];
  }));
  const requiredNames = Object.values(byIndustry).flatMap((industry) => [...Object.keys(industry.requiredMaterials ?? {}), ...industry.producedMaterials]);
  const names = /** @type {Parameters<typeof ns.corporation.getMaterialData>[0][]} */ ([...new Set([...BOOST_MATERIALS, ...requiredNames])]);
  const materials = names.map((material) => ns.corporation.getMaterialData(material));
  const sizes = Object.fromEntries(materials.map((material) => [material.name, material.size]));
  const baseCosts = Object.fromEntries(materials.map((material) => [material.name, material.baseCost]));
  const baseMarkups = Object.fromEntries(materials.map((material) => [material.name, material.baseMarkup]));
  ns.write("data/corp/industry-data.txt", JSON.stringify({ industries: byIndustry, sizes, baseCosts, baseMarkups }), "w");
}
