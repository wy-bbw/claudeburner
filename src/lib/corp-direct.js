import { BOOST_MATERIALS } from "lib/corp-boosts.js";
import { readCorporationState } from "lib/corp-state.js";

// The corporation API called in this process, for services/corp-manager-direct.js: no state file, no reader scripts.
// Each reader below is the body of workers/corp-read-<name>.js (same output), returning the data instead of writing a file.
// RAM: every distinct corporation call used in this file costs 10 GB (11 calls ~ 110 GB). The 20 GB action calls stay in
// the workers (lib/corp-scripts.js runActionByPort): all of them in one script would not fit into 512 GB.

/**
 * @param {NS} ns @param {string} name which reader (see switch) @param {string[]} args JSON arguments, like the workers get
 * @returns {Promise<any>}
 */
export async function runReader(ns, name, args) {
  const corporation = ns.corporation;
  switch (name) {
    case "corporation":
      return corporation.getCorporation();
    case "investment":
      return corporation.getInvestmentOffer();
    case "divisions": {
      const names = /** @type {string[]} */ (JSON.parse(args[0]));
      return names.map((divisionName) => {
        const division = corporation.getDivision(divisionName);
        return {
          name: division.name, industry: division.industry, awareness: division.awareness, popularity: division.popularity,
          productionMult: division.productionMult, researchPoints: division.researchPoints, numAdVerts: division.numAdVerts,
          lastCycleRevenue: division.lastCycleRevenue, lastCycleExpenses: division.lastCycleExpenses,
          cities: division.cities, products: division.products, makesProducts: division.makesProducts, maxProducts: division.maxProducts,
        };
      });
    }
    case "offices": {
      const places = /** @type {{division: string, city: CityName}[]} */ (JSON.parse(args[0]));
      return places.map(({ division, city }) => ({ division, ...corporation.getOffice(division, city) }));
    }
    case "warehouses": {
      const places = /** @type {{division: string, city: CityName}[]} */ (JSON.parse(args[0]));
      const warehouses = [];
      for (const { division, city } of places) {
        try {
          warehouses.push({ division, ...corporation.getWarehouse(division, city) });
        } catch {
          // no warehouse in this city yet
        }
      }
      return warehouses;
    }
    case "materials": {
      const places = /** @type {{division: string, city: CityName}[]} */ (JSON.parse(args[0]));
      const materialNames = corporation.getConstants().materialNames;
      while ((await corporation.nextUpdate()) !== "SALE"); // `stored` must be what the last sale left over
      const materials = [];
      for (const { division, city } of places) {
        for (const materialName of materialNames) {
          const material = corporation.getMaterial(division, city, materialName);
          if (material.stored || material.buyAmount || material.productionAmount || material.actualSellAmount || material.exports.length || material.importAmount) {
            materials.push({ division, city, name: materialName, stored: material.stored, quality: material.quality, buyAmount: material.buyAmount,
              productionAmount: material.productionAmount, actualSellAmount: material.actualSellAmount, marketPrice: material.marketPrice,
              importAmount: material.importAmount, exports: material.exports,
              desiredSellAmount: material.desiredSellAmount, desiredSellPrice: material.desiredSellPrice });
          }
        }
      }
      return materials;
    }
    case "products": {
      const places = /** @type {{division: string, cities: CityName[], names: string[]}[]} */ (JSON.parse(args[0]));
      while ((await corporation.nextUpdate()) !== "SALE");
      return places.flatMap(({ division, cities, names }) => cities.flatMap((city) => names.map((productName) => {
        const product = corporation.getProduct(division, city, productName);
        return {
          division, city, name: productName, developmentProgress: product.developmentProgress, rating: product.rating,
          effectiveRating: product.effectiveRating, desiredSellAmount: product.desiredSellAmount,
          desiredSellPrice: product.desiredSellPrice, stored: product.stored, productionAmount: product.productionAmount,
          actualSellAmount: product.actualSellAmount, productionCost: product.productionCost,
          designInvestment: product.designInvestment, advertisingInvestment: product.advertisingInvestment,
        };
      })));
    }
    case "research-status": {
      const requests = /** @type {{division: string, names: CorpResearchName[]}[]} */ (JSON.parse(args[0]));
      return requests.map(({ division, names }) => ({
        division, researched: names.filter((researchName) => corporation.hasResearched(division, researchName)),
      }));
    }
    case "upgrades":
      return Object.fromEntries(corporation.getConstants().upgradeNames.map((upgradeName) => [upgradeName, corporation.getUpgradeLevel(upgradeName)]));
    case "industry-data": {
      const industries = /** @type {CorpIndustryName[]} */ (JSON.parse(args[0]));
      const byIndustry = Object.fromEntries(industries.map((industry) => {
        const data = corporation.getIndustryData(industry);
        return [industry, {
          factors: { "Real Estate": data.realEstateFactor ?? 0, Hardware: data.hardwareFactor ?? 0, Robots: data.robotFactor ?? 0, "AI Cores": data.aiCoreFactor ?? 0 },
          requiredMaterials: data.requiredMaterials, producedMaterials: data.producedMaterials ?? [], makesProducts: data.makesProducts,
        }];
      }));
      const materials = BOOST_MATERIALS.map((material) => corporation.getMaterialData(material));
      const sizes = Object.fromEntries(materials.map((material) => [material.name, material.size]));
      const baseCosts = Object.fromEntries(materials.map((material) => [material.name, material.baseCost]));
      return { industries: byIndustry, sizes, baseCosts };
    }
    default:
      throw new Error(`unknown corporation reader ${name}`);
  }
}

/**
 * The corporation as it is right now, read from the API. Null while there is no corporation.
 * @param {NS} ns
 */
export async function readStateDirect(ns) {
  if (!ns.corporation.hasCorporation()) return null;
  const state = await readCorporationState(ns, runReader);
  return { time: Date.now(), ...state };
}
