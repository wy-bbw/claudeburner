# bitburner-ai

Experiment: playing Bitburner (Steam, v3.0.1) with Claude writing all the scripts. Fresh save started 2026-10-11.
Detailed notes (formulas read from the game code, lessons, BitNode history): `docs/notes-archive.md`. Read the part
for a topic before working on it; it is history, so trust the code and live measurements over it.

## Goal
Fastest progress by **real time**. Verify every model/claim by measuring (hacking: `services/hacking/metrics.js` +
`bridge/report.mjs`, baseline vs change, marks in `marks.txt`; corporation: its logs). Formulas from memory have been
wrong: read them in the game source (github bitburner-official/bitburner-src, branch `stable` = v3.0.1).
`~/develop/bitburner/bitburner` is an old v1.3.0 checkout: do not use it.

## Status (2026-10-26)
- BitNode 5, SF1.1 SF3.3 SF4.1 (Singularity RAM x16), home 512 GB. Multipliers: `run tools/bitnode-status.js`.
- Corporation "organa" is public, funds ~1e88; divisions agri (Agriculture), grenga (Chemical), ama (Tobacco),
  norad (Pharmaceutical). Money is no constraint.
- Next: augmentations (company factions via company work, bribes), Intelligence farm, then `w0r1d_d43m0n` (hacking 4500).
- BitNode order after BN5 (user): BN10.1 (sleeves: buy all Covenant sleeves and memory before leaving) -> BN2 (gangs)
  -> BN4.2/4.3 -> maybe BN10.2/10.3.

## Setup
- `node bridge/server.mjs` (run it as a background task): Remote API bridge, the game connects to ws://localhost:12525
  (Options -> Remote API, wss off). Pushes `src/**` to home on connect and on every change; refreshes
  `NetscriptDefinitions.d.ts`. Dashboard: http://127.0.0.1:12526/dashboard.
- `node bridge/cli.mjs status | sync | ls | get <file> | ram <file>… | run <script> [-h host] [-t N] [args] | call <method> [json]`
  (`run` needs `agent.js` running on home).
- Node is at `C:\Program Files\nodejs`: prepend it to PATH in shells started before the install.
- After every reset: `run start.js` (hacking BitNodes: hacking service, darknet, contracts, agent) or
  `run start-corporation.js` (corporation BitNodes: corp services + agent, no hacking). `tools/install-augmentations.js
  --then <script>` starts it by itself after the install.

## Conventions
- `npx tsc -p jsconfig.json` before relying on a script; trust `NetscriptDefinitions.d.ts`, not memory (the API drifts).
- Imports are root-absolute (`lib/net.js`), matching the game's file layout.
- Everything needed after a new BitNode must start on an 8 GB home (start.js 7.35 GB, agent.js 3.7 GB).
- RAM calculator: call port openers explicitly (no dynamic `ns[fn]`); any identifier named like an ns function is
  billed (`flags.share`, a helper `run`, a local `research`); check `cli ram` after edits. The game caches a script's
  RAM until that file itself changes.
- Corporation calls cost 10-20 GB each: one corporation function per worker script (`workers/corp/read-*.js` 11.6 GB,
  `workers/corp/do-*.js` 21.6 GB), run one at a time through `lib/corp-scripts.js`.
- Logs the user reads are text lines (`lib/log.js`); files only scripts read stay JSON.
- Meaningful names (see ~/.claude/CLAUDE.md).

## Layout (`src/`, synced to home)
Structure rule (user): themes `hacking`, `corp`, `darknet`, `coding-contracts`, `backdoor`, `intelligence` (new theme =
new folder, not a prefix). `services/` long-running: top level only what the user starts by hand, services started by
other scripts in `services/<theme>/`. `tools/` one-shots run by hand: general ones top level, theme ones in
`tools/<theme>/`. `workers/<theme>/` single operations started by other scripts. `lib/` shared code (flat, prefixed).
Inside a theme folder the file name drops the theme prefix; role prefixes (`read-`, `do-`, `batch-`) stay.
`start.js`, `start-corporation.js` and `agent.js` stay top level because the user types them.

What is there:
- **Hacking**: `services/hacking/batcher.js` (HWGW batches with Formulas.exe; planner `lib/batch-planner.js`, log
  data/batcher.txt) or `controller.js` (without Formulas.exe), `metrics.js`; `workers/hacking/`; `tools/hacking/`
  (batch-plan, check-grow, debug-hack-plan); `services/server-buyer.js` (by hand).
- **Corporation**: `services/corp/manager.js` (logic in `lib/corp-manager-core.js`: products, pricing, Wilson/Advert,
  reinvesting, supplier scaling; log data/corp-manager.txt), `status.js` (dashboard feed), `supply.js` (replaces Smart
  Supply); `services/corp-startup.js` (startup phases, dry run unless `--go`; walkthrough `docs/corp-phase-2.md`),
  `services/corp-upkeep.js`; `tools/corp/` request tools (queued in data/corp-requests.txt, run by the manager):
  add-division, adverts, boosts, expand, exports, limit-production, office, upgrades.
- **Augmentations and stats** (Singularity): `tools/buy-augmentations.js`, `tools/install-augmentations.js`,
  `tools/combat-augmentations.js`, `services/gym-trainer.js` and `gym-trainer-lowest-stat.js` (`lib/gym-training.js`),
  `tools/stat-eta.js`, `services/crime.js`.
- **Intelligence**: `tools/intelligence/farm.js` -> `workers/intelligence/join-and-reset.js` (joins the keepOnInstall
  factions, soft resets, repeats; every reset wipes money and stats, so run it right after an install; stop early with
  data/intelligence-farm-stop.txt; log data/intelligence-farm.txt; cycle rate not measured yet).
- **Infiltration**: `services/infiltration-autopilot.js` (target choice, travel, solve, trade or sell),
  `services/infiltration-solver.js` (solver only), `lib/infiltration-minigames.js`, `tools/infiltrations.js`.
- **Darknet**: `services/darknet/orchestrator.js` (started by start.js) -> `workers/darknet/crawl.js`, `phish.js`;
  password models in `lib/darknet-models.js`; `tools/darknet/` (map, crack); log data/darknet.txt. Unsolved models:
  Factori-Os, OpenWebAccessPoint, NIL, Pr0verFl0, DeepGreen.
- **Coding contracts**: `services/coding-contracts/solver.js`, `lib/contract-solvers.js`; verify changes with
  `tools/coding-contracts/test-solvers.js` first.
- **Stocks**: `services/stock-trader-4s.js` or `stock-trader.js` (never both; `lib/stock-trading.js`; meant for BN8).
- **General tools**: `tools/backdoor/` (chains, all), `path`, `root`, `kill`, `kill-all`, `usage`, `state`,
  `player-status`, `bitnode-status`, `bootstrap-purchases`.

## Key facts (game code v3.0.1; details and more in docs/notes-archive.md)
- Servers start at 4% of max money: low-growth targets need hours of prep.
- Company factions: employed + 400k company rep (300k with a backdoor on the company's own server); they keep their
  invite across installs (keepOnInstall), so the grind is once per BitNode.
- Corporation: bribes give 1 faction rep per $1b of corp funds (from $100t valuation). Exports stay need-based
  `(IPROD+IINV/10)*(-1)` and suppliers are scaled to demand; Smart Supply option "leftovers"; never cap production at
  exactly 0 (NaN quality, fixed by save + reload). Product bomb: Wilson before Advert, then a new product division.
- Infiltration: difficulty >= 3.5 kills you; market demand is one global value.
- Intelligence XP (no augmentation multiplies it): joinFaction 7.5, buying or installing augmentations via Singularity
  15 each, terminal `hack` 4 x log10(hack exp), destroying a BitNode 300. Bonus = 1 + int^0.8 / 600 on hacking
  speed/chance, work rep, crime.
- Formulas.exe comes free on every install in BN5 and with SF5.
