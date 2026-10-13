# bitburner-ai

Experiment: playing Bitburner (Steam) with Claude writing all the scripts. Fresh save started 2026-10-11.

## Goal
Fastest progress by **real time**. Start on easy targets, move to harder ones when they pay more net of prep time;
prep the next target in parallel. Verify every model/claim with the metrics sampler (`services/metrics.js` + `bridge/report.mjs`,
baseline vs change, marks in `marks.txt`) — formulas from memory have been wrong before.
Lesson: every server starts at 4% of max money; low-growth targets need hours of prep (sigma-cosmetics ~5 h), n00dles ~1 min.

## Status (2026-10-13, late BitNode 1)
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
  `services/` long-running (`controller.js` or, with Formulas.exe, `batcher.js` (HWGW batches; planner in `lib/batch-planner.js`, preview: `tools/batch-plan.js`, log data/batcher.txt; workers `workers/batch-*.js` take an absolute landing time) on a rooted server; on home: `metrics.js`, `coding-contracts.js`, `server-buyer.js` = ns.cloud servers, buys only after TOR + BruteSSH..HTTPWorm are owned (cheaper RAM per GB) and when <10% thread slots are free, `darknet-orchestrator.js`) · `tools/` one-shots
  (`root`, `path` for backdoor connect chains, `backdoor-chains` = paste-ready chain for every server still missing a backdoor (faction + company servers first; `--important`),  `kill`, `kill-all` (every script on every reachable server; `--keep-agent`), `state`, `check-grow`, `usage` = RAM and scripts per server + threads per target, `test-contract-solvers`, `debug-hack-plan`).
- Coding contracts: `lib/contract-solvers.js` (all 30 types; `tools/describe-contract-type.js` fetches the game's description for a type). Verify with `tools/test-contract-solvers.js` (dummy contracts, results in data/contract-solver-test-results.txt) before trusting changes; `services/coding-contracts.js` on home only attempts verified types and blocks a type after one real failure. Log: data/coding-contracts.txt (readable lines via lib/log.js; logs the user reads are text, logs only scripts read stay JSON). First run: 10 solved, ~5k CyberSec rep + $50M.
- Start the hacking service: `node bridge/cli.mjs run start.js [--rep <share fraction>]` (restart: `tools/kill.js <host> services/batcher.js` first; a new batcher adopts in-flight batches by their landing times).
- Use meaningful names (user rule, see ~/.claude/CLAUDE.md).
