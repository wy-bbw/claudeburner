# Corporation phase 2: after accepting round 1

Phase 1 is `run services/corp-startup.js --phase startup --go` (Agriculture in six cities, storage, fill, 75 RP)
up to the round-1 offer. Phase 2 starts right after you accept round 1 and ends with the round-2 offer.
Reference result (2026-10-23): round 1 ~$510b, round-2 offer ~$1.95t at ~$3.6M/s profit, funds -$49b from the fills.

## Before you start
- Round 1 is accepted and the cash is in the corporation (~$460-510b).
- Home has ~25 GB free: the script runs the corp workers (11.6 GB readers, 21.6 GB actions) one at a time.
- Nothing else spends corp money: no `services/corp/manager.js`, no `start-corporation.js`, no request tools.
  `services/corp/status.js` (dashboard) and `services/corp/supply.js` may keep running: supply leaves warehouses alone
  once the real Smart Supply is on.

## 1. Dry run
```
run services/corp-startup.js --phase after-round-1
```
Prints every step with its cost and writes it to `data/corp-startup.txt`. Check that the total fits the cash.
Optional: `--chemical <name>` names the new division (otherwise it asks, or uses an existing Chemical division);
`--fill 0.83` is the default fill share.

## 2. Run it
```
run services/corp-startup.js --phase after-round-1 --go
```
What it does, in this order (each step stops the run if the cash is missing):

| # | Step | Detail |
|---|------|--------|
| 1 | Unlocks | Market Research - Demand, Market Data - Competition (needed for our TA.II prices), Smart Supply, Export |
| 2 | Chemical division | created, expanded to all six cities |
| 3 | Chemical offices | 3 -> 6 employees: Ops 1 / Eng 2 / Business 1 / Mgmt 1 / R&D 1 |
| 4 | Agriculture offices | 4 -> 7 employees: Ops 1 / Eng 1 / Business 1 / Mgmt 1 / R&D 3 |
| 5 | Smart Supply | on in both divisions, imports on "leftovers" (never "imports": the stock piles up) |
| 6 | Exports | Plants Agriculture -> Chemical and Chemicals Chemical -> Agriculture, amount `(IPROD+IINV/10)*(-1)`, every city |
| 7 | Sell orders | Chemicals on MAX at MP |
| 8 | Chemical warehouses | +3 levels (to 4) |
| 9 | Fill | boost materials in both divisions, on debt via buy orders (the script waits for the stock, then sets the orders to 0) |
| 10 | Research | waits until Agriculture has 700 research points |
| 11 | Agriculture jobs | R&D staff to sales: Ops 3 / Eng 1 / Business 2 / Mgmt 1 / R&D 0 (size 7); Chemical keeps 1/2/1/1/1 |

If the script is killed during the fill, set the boost buy orders back to 0 by hand (rerunning `--only fill` would buy again).
Single steps: `--only <step>` (unlocks, create-division, expand, staff, smart-supply, exports, sell-orders, warehouses,
fill, research).

## 3. Prices and upkeep
As soon as the script is done (at the latest after the fill, so Food/Plants/Chemicals do not pile up):
```
run services/corp/manager.js --upkeep-and-prices-only
```
Only tea/parties, TA.II-style prices (needs the two Market unlocks from step 1) and queued requests; it buys no
Wilson/Advert and makes no products. Not `start-corporation.js` here: that starts the full manager (`--reinvest-minutes 30`).

## 4. Optional: corporation upgrades
The 2026-10-23 run also had these by round 2 (bought by hand, order and timing unknown, not in the script):
Smart Storage 13, Smart Factories 4, Wilson Analytics 4, ABC SalesBots 11, Project Insight 6, Neural Accelerators 14,
FocusWires 16, Speech Processor Implants 13, Nuoptimal Nootropic Injector Implants 13.
Wilson before any Advert (each Advert level uses the Wilson level at the time of purchase). Bigger warehouses need a new fill.

## 5. Accept round 2
- Watch the offer on the dashboard (http://127.0.0.1:12526/dashboard) or the game's Corporation screen.
- After the last purchase wait ~10 market cycles: the offer averages 10 cycles, and a cycle with falling assets counts as 0.
- Accept when it stops rising. Target: ~$2t (the earlier fixed plan expected ~$3.2t; `--phase after-round-1-fixed`).

## Alternatives (for comparison only)
- `--phase after-round-1-fixed`: Wilson 4 + upgrade list, warehouses level 10, 6 employees 1/1/2/1/1, Advert 16, fill.
- `--phase after-round-1-optimized`: budget-driven; worse in its one test (~$8-11M/s, ~$2t offer). Not recommended.
