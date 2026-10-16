# bitburner-ai

Experiment: playing Bitburner (Steam) with Claude writing all the scripts. Fresh save started 2026-10-11.

## Goal
Fastest progress by **real time**. Start on easy targets, move to harder ones when they pay more net of prep time;
prep the next target in parallel. Verify every model/claim with the metrics sampler (`services/metrics.js` + `bridge/report.mjs`,
baseline vs change, marks in `marks.txt`) — formulas from memory have been wrong before.
Lesson: every server starts at 4% of max money; low-growth targets need hours of prep (sigma-cosmetics ~5 h), n00dles ~1 min.

## Status (2026-10-16): BitNode 3 done, BitNode 4 next
- BN3 result (2 days): corporation profit $2.7M/s -> ~$1.8e28/s, personal money ~1e49 (dividends + shares), all
  augmentations via corporation bribes ($1b corp funds per faction rep point) and company work (8k company rep/s with
  the late multipliers: 300k invite in < 40 s with the company server backdoored). Endgame lever: NeuroFlux levels via
  bribes for the hacking level `w0r1d_d43m0n` needs (3000 x WorldDaemonDifficulty).
- BN4 plan (multipliers from the game code): no corporation penalties (same as BN3), ScriptHackMoney 0.2, HackExpGain 0.4,
  gym/company/faction work exp 0.5, FactionWorkRepGain 0.75, WorldDaemonDifficulty 3 = hacking 9000. Reward SF4 =
  Singularity API (RAM x16 at SF4.1, x4 at 4.2, x1 at 4.3): automate factions, augmentation buying, installs, work.
  Start: `run start.js` (hacking) until $150b personal money -> create the corporation self-funded (seed money is BN3
  only) -> round 1 by hand -> buy Office API + Warehouse API ($50b each in corp funds; free only with SF3.3; every corp
  script needs them) -> `run start-corporation.js` -> the BN3 recipe with the tools (corp-add-division, ...).
  After every augmentation install run start-corporation.js as well as start.js (start.js starts no corp services).

## History: late BitNode 1 (2026-10-13)
- BitNode 1 near the end: 33 augmentations installed, NeuroFlux Governor level 69 (next level ~4.2M rep: x1.14 per
  level from base 500, read from the game code). Money ~$4q, income ~$1t/s once the big targets are prepped,
  home 8.39 PB, hacking ~1900, charisma ~2700 (darknet phishing). Money is no longer scarce; faction rep is.
- Factions: Bachman & Associates has 150 favor = donations unlocked (rep for money: 400k rep ~ $163b at faction_rep
  x2.45). Company rep in progress: Fulcrum (threshold 300k, both backdoors done), Clarke, ECorp. Also The Black Hand,
  Tian Di Hui. Company factions keep membership across installs (see below).
- Favor after install = log(cumulative rep / 25000 + 1) / log(1.02); 150 favor = 462,490 cumulative rep (matches the
  game's favor preview). The loop that works: earn rep until the preview shows 150, install (any cheap aug, e.g. 7.5k
  rep from a city faction; NeuroFlux is too expensive by now), then donate. The dashboard's favor panel tracks it.
- Every install costs ~20-30 min of reduced income while the big targets are re-prepped from 4% money, plus Formulas.exe
  ($5b) and DarkscapeNavigator.exe must be rebought (the darknet service waits for it); TIX/4S access survives.
- Next: Daedalus (30 augs + $100b met; needs hacking 2500 -> NeuroFlux/augs bought via Bachman donations), 150 favor
  there, donate ~$1t for The Red Pill (2.5M rep), backdoor w0r1d_d43m0n. Then BitNode plan: BN3 once (SF3.1 is enough:
  level 3 only saves the $50b Office API + $50b Warehouse API unlocks per corp), BN4 three times (Singularity RAM
  x16/4/1), then BN10 (sleeves). Corporation bribes: $1b corp funds per rep point, no favor needed, but only from
  $100t corp valuation (game code). Build corp automation in BN3 in stages: status reader -> APIs -> products -> bribes.
- BitNode 3 since 2026-10-13 (multipliers read from the game code: ServerMaxMoney 0.04, ScriptHackMoney 0.2, ServerGrowthRate
  0.2, aug cost x3, FavorToDonateToFaction 0.5 = donations at 75 favor, WorldDaemonDifficulty 2). Hacking pays ~nothing
  here; the corporation is the engine. Corp "Claudia AG", Agriculture division "food" (Sector-12 + Aevum at the start).
  In BN3 (or with SF3.3) the Office and Warehouse APIs are unlocked for free. The game embeds a full corporation guide in
  main.bundle.js (search "# General advice", "# Financial statement", "# Boost material"): read it instead of guessing.
  Verified there: pre-IPO valuation = ($10b + funds/3 + 315,000 x profit/s) x 1.1^(offices+warehouses/12), round 1 offer
  = 30% of it for 10% of the 1e9 original shares (government seed money = +500M shares); boost optimum (Lagrange; Real
  Estate first, then Hardware + AI Cores, Robots never for Agriculture); production = (Ops^0.4 + Eng^0.3) x (1 + Mgmt/
  (1.2 x prod staff)) -> ~40/20/40 Ops/Eng/Mgmt; >= 9 employees need >= 1/9 interns or energy/morale decay; sell
  price penalty-free up to MP + quality/markup (Market-TA.I/II automate it).
  Valuation code detail: each cycle's value uses the asset change per second, negative changes count as 0, and the offer
  averages 10 cycles -> buy everything in one go, then wait ~10 cycles before accepting. Bonus time runs the corp ~10x.
  Round 1 $73b, round 2 $1.5t accepted (2026-10-14; player keeps 550M of 1.5e9 shares). Divisions: "food" (Agriculture),
  "FSAB" (Chemical), "tobacco" (Tobacco, main office Aevum 30+, 5 support offices mostly R&D).
  Lessons: Smart Supply option for imported materials must be "leftovers" ("imports" ignores the stock: imports piled
  up, the warehouses filled and Agriculture production fell to 40%). Research only when it costs < half the RP pool;
  RP per office = 0.004 x sqrt(R&D output) -> Project Insight (linear) beats more R&D staff. Product effective rating =
  min(rating, sqrt(rating) x input quality): with Plants quality ~50, input quality is not the bottleneck below ~2500.
  Game bug: a produced material whose stock and production are both 0 in a cycle gets quality 0/0 = NaN forever
  (unsellable); save + reload fixes it (JSON turns NaN into null). Never cap production at exactly 0.
- The bridge runs as a background task of the session: start it again with `node bridge/server.mjs` (the game reconnects,
  or Options -> Remote API -> Connect after a game restart).
- Darknet: map + crack tools exist (`tools/darknet-*.js`); Those are fine. Do continue it.
  `services/darknet-orchestrator.js` (home, started by start.js) runs a sweep every 5 min: `workers/darknet-crawl.js` spreads over every
  server `lib/darknet-models.js` cracks (hint rules + model guessers), opens caches, then turns into `workers/darknet-phish.js` with all
  free RAM. Log data/darknet.txt. First run: ~13-20 servers, ~60 phishing threads; phishing pays ~$450/success (mostly charisma XP).
  Unsolved models (log `unknown`): Factori-Os, OpenWebAccessPoint, NIL, Pr0verFl0, DeepGreen. BellaCuore is solved (roman
  numeral in data, e.g. XCIX = 99). Failed logins log the target's heartbleed logs (often feedback on the attempt).
  Adding FreshInstall_1.0 + AccountsManager_4.2 guessers took a sweep from 7-11 to 19 servers.
  Darknet files (crawler logs them as `file`): "The password for <host> contains 6 and 8" (clues for other servers),
  "Some common passwords include …" (word lists), "Remember this password: 71", and tips (NIL = "you are one who's'nt
  authorized" probably gives partial feedback, but authenticate only answers 401 → look at heartbleed logs).
  AccountsManager 0-100 got 503 Service Unavailable partway through 100 tries (rate limit or server offline?).
  `services/darknet-crawler.js` is an older unfinished draft (truncated, fails tsc).
- Company factions (read from the game code, v3.0.1, main.bundle.js): invite = employed at the company + 400k company rep
  (CorpFactionRepRequirement), x0.75 = 300k with a backdoor on the company's own server (Fulcrum Technologies -> fulcrumtech,
  not fulcrumassets). Fulcrum Secret Technologies also needs a backdoor on fulcrumassets. All company factions keep
  membership across aug installs (keepOnInstall), so the company grind is once per BitNode. No crime/karma requirement. `tools/path.js <server>` prints the connect chain. Clarke = clarkinc (needs hacking 1153).
- Infiltration (2026-10-16): `services/infiltration-solver.js` (1.6 GB) solves all 8 mini-games. The game only checks `isTrusted && instanceof
  KeyboardEvent` in its document keydown listener (failure = automated = hospital); the solver skips it: it finds the infiltration object
  via the React fiber `memoizedProps.state` of any h4 and calls `stage.onKey({key,...})` directly. Verified offline against the real stage
  classes from main.bundle.js (12800 runs, 0 failures); the fiber lookup is untested live. Start button is only pressed below
  `--max-difficulty` (3; at >= 3.5 the game kills you). `tools/infiltrations.js` lists targets by money/rep per difficulty.
- Ideas not started: install helper (aug order/cost/timing from a pasted faction list).
- Stock traders (2026-10-12): `services/stock-trader-4s.js` (4S forecast; buy >= 0.6 ranked by (forecast-0.5)*volatility,
  sell < 0.55; 19.75 GB) and `services/stock-trader.js` (no 4S: forecast estimated from 50 ticks, buy >= 0.65, sell < 0.5,
  quick sell at <= 2 of the last 10 ticks up; 14.75 GB). Shared code `lib/stock-trading.js`, log data/stocks.txt. Run one,
  never both; `--keep <fraction>` holds cash back (default 0 = all in). Not worth it in BN1: the whole market is only ~$5.7t
  (~6 s of late-BN1 hacking income); meant for BitNode 8. The 20-tick first version churned (bought noise, lost the spread);
  the 50-tick version is computed, not yet tested live. Aug installs liquidate positions; TIX/4S access survives them.
- HWGW batcher (2026-10-11, Formulas.exe bought): ~110M $/s with the controller -> ~19B $/s within 11 min (mark `batcher-start`),
  0 desyncs / 0 cancelled batches in 40k; XP ~80x. Formulas.exe is lost on install: rebuy it ($5b at the darknet market) each round.
  Open: planned targets far from max money (rho-construction 4%) wait for prep RAM while batches hold their reserve.

## Setup
- `node bridge/server.mjs` — Remote API bridge. Game connects to ws://localhost:12525 (Options → Remote API, wss off).
  Pushes `src/**` to `home` on connect and on every change; refreshes `NetscriptDefinitions.d.ts` from the game.
- Live dashboard: http://127.0.0.1:12526/dashboard (served by the bridge; `bridge/dashboard.html` + `bridge/dashboard-data.mjs`
  read data/metrics.txt, state.txt, darknet.txt, coding-contracts.txt; refresh 5 s). Open the URL, not the file.
- `node bridge/cli.mjs …` — talks to the bridge (control port 12526): `status | sync | ls | get <file> | ram <file>… | run <script> [-h host] [-t N] [args] | call <method> [json]`.
- After every reset (augmentation install or new BitNode) the user types `run start.js`: it roots, starts the hacking service on the biggest rooted server (`services/batcher.js` with Formulas.exe, else `controller.js`; the controller runs start.js itself once Formulas.exe appears, and start.js kills it), metrics if home has room, then spawns `agent.js` (fits an 8 GB home). `agent.js` must be running on home. It executes `cli run` commands; for remote hosts it scp's all `.js` first.
- In corporation BitNodes use `run start-corporation.js` instead: services/corp-status.js + services/corp-manager.js +
  agent.js only, no hacking or hacking-economy home services (corp calls cost 10-20 GB each, home has 32 GB). start.js
  would start those again. Corp scripts: one corporation function per worker script (`workers/corp-read-*.js` 11.6 GB,
  `workers/corp-do-<action>.js` 21.6 GB, taking a JSON list of calls), run one at a time via `lib/corp-scripts.js`
  (waits for free RAM). corp-manager.js: products (develop, discontinue the worst, sell), custom Market-TA.II pricing
  for products and materials (`lib/corp-pricing.js`: C = sold x (price-MP)^2 from a cycle with stock left, price =
  MP + sqrt(C/supply); log data/corp-manager.txt, prices data/corp-prices.txt), Wilson + Advert (`--hold-upgrades`
  before accepting an offer). `tools/corp-exports.js` sets the Agriculture/Chemical/Tobacco exports + Smart Supply
  options; a tool's 21.6 GB worker does not fit next to corp-manager on 32 GB: kill corp-manager, run the tool, restart.
  Request tools (1.6 GB, queue a JSON line in data/corp-requests.txt; corp-manager runs one per round on a state read
  after the previous request, `--dry-run` logs the plan): `tools/corp-upgrades.js --budget-fraction f` (Smart
  Factories/Storage, employee upgrades, Project Insight; cheapest level first), `tools/corp-boosts.js --division d
  --budget-fraction f [--fill 0.6]` (highest warehouse level + Lagrange boosts within budget), `tools/corp-office.js
  --division d --city c|all --size n|--budget-fraction f [--jobs "Operations:4,Engineer:22,..."]` (grow, hire,
  ceil(size/9) interns first, split). The manager also buys tea and throws parties below max energy/morale - 2.
  The game silently ignores office/warehouse upgrades it cannot afford (workers then report ok).
- Product bomb recipe (worked 2026-10-16: profit $190t/s -> $2.4q/s in 6 minutes): basic machinery first
  (Agriculture -> Chemical -> products, exports, pricing), then Wilson Analytics as high as possible (each Advert
  purchase uses the Wilson multiplier at the time of purchase: buy Wilson BEFORE Advert), then a NEW product division
  (Advert levels count per division: a new one starts at the cheap levels; all corporation-wide upgrades apply at once;
  a big main office gives high-rated first products), ad bomb it, Market-TA.II turns the potential sales into price.
  High science factor helps the rating: Pharmaceutical "sicko" (0.8) out-earned Tobacco 6x. Tools: corp-expand,
  corp-office, corp-boosts, corp-exports (generic from industry data), corp-adverts; the manager runs products for
  every product division.
- With lots of home RAM, a single corporation script calling the API directly would replace the workers + request
  queue (not done yet; the worker design still works on a 32 GB home at the start of a BitNode).
- Node is at `C:\Program Files\nodejs` — prepend to PATH in shells started before the install.

## Conventions
- Always `npx tsc -p jsconfig.json` before relying on a script: the API drifts between versions (e.g. `ns.formatNumber` → `ns.format.number`). Trust `NetscriptDefinitions.d.ts`, not memory.
- Imports are root-absolute (`lib/net.js`), matching the game's file layout.
- Home RAM resets to 8 GB on a new BitNode: everything must still start on 8 GB (start.js 7.35 GB, agent 3.7 GB). The controller runs on a rooted server and uses home only above `--home-reserve` (16 GB).
- Call port openers explicitly; dynamic `ns[fn]` breaks the RAM calculator.
- The RAM calculator bills any identifier that matches an ns function, also local functions and properties: `flags.share` cost 2.4 GB (ns.share), a helper named `run` cost 1 GB (ns.run). Avoid such names; check `cli ram` after edits.
- `data/state.txt` on home is the controller's JSON snapshot; `tools/state.js` writes a heavier full dump to `data/full-state.txt` (4.7 GB).

## Layout (`src/`, synced to home)
- `start.js`, `agent.js` — top level because the user types them by hand.
- `lib/` shared code · `workers/` single-operation jobs (hack, grow, weaken, share), started only by the controller ·
  `services/` long-running (`controller.js` or, with Formulas.exe, `batcher.js` (HWGW batches; planner in `lib/batch-planner.js`, preview: `tools/batch-plan.js`, log data/batcher.txt; workers `workers/batch-*.js` take an absolute landing time) on a rooted server; on home: `metrics.js`, `coding-contracts.js`, `server-buyer.js` = ns.cloud servers, buys only after TOR + BruteSSH..HTTPWorm are owned (cheaper RAM per GB) and when <10% thread slots are free, `darknet-orchestrator.js`, `corp-status.js` = corp state every 20 s -> data/corp-state.txt + data/corp-history.txt for the dashboard, via one reader script per corp call `workers/corp-read-*.js` (11.6 GB each, run one at a time)) · `tools/` one-shots
  (`root`, `path` for backdoor connect chains, `backdoor-chains` = paste-ready chain for every server still missing a backdoor (faction + company servers first; `--important`),  `kill`, `kill-all` (every script on every reachable server; `--keep-agent`), `state`, `check-grow`, `usage` = RAM and scripts per server + threads per target, `test-contract-solvers`, `debug-hack-plan`).
- Coding contracts: `lib/contract-solvers.js` (all 30 types; `tools/describe-contract-type.js` fetches the game's description for a type). Verify with `tools/test-contract-solvers.js` (dummy contracts, results in data/contract-solver-test-results.txt) before trusting changes; `services/coding-contracts.js` on home only attempts verified types and blocks a type after one real failure. Log: data/coding-contracts.txt (readable lines via lib/log.js; logs the user reads are text, logs only scripts read stay JSON). First run: 10 solved, ~5k CyberSec rep + $50M.
- Start the hacking service: `node bridge/cli.mjs run start.js [--rep <share fraction>]` (restart: `tools/kill.js <host> services/batcher.js` first; a new batcher adopts in-flight batches by their landing times).
- Use meaningful names (user rule, see ~/.claude/CLAUDE.md).
