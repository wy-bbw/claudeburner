# bitburner-ai

Experiment: playing Bitburner (Steam) with Claude writing all the scripts. Fresh save started 2026-10-11.

## Goal
Fastest progress by **real time**. Start on easy targets, move to harder ones when they pay more net of prep time;
prep the next target in parallel. Verify every model/claim with the metrics sampler (`services/metrics.js` + `bridge/report.mjs`,
baseline vs change, marks in `marks.txt`) — formulas from memory have been wrong before.
Lesson: every server starts at 4% of max money; low-growth targets need hours of prep (sigma-cosmetics ~5 h), n00dles ~1 min.

## Status (2026-10-11, end of first session)
- Round 3 of BitNode 1 (two augmentation installs done). Factions joined: CyberSec, NiteSec, Sector-12, Netburners,
  The Black Hand (joined 2026-10-11, hacking ~417). NiteSec rep was the bottleneck (~4k, ~2 rep/s).
- Income ~10–15M $/s with all port openers; home 2 TB; ~120 TB incl. cloud servers; share at 10%.
- The bridge ran as a background task of the session: start it again with `node bridge/server.mjs` (the game reconnects).
- Darknet: map + crack tools exist (`tools/darknet-*.js`); Those are fine. Do continue it.
  `services/darknet-orchestrator.js` (home, started by start.js) runs a sweep every 5 min: `workers/darknet-crawl.js` spreads over every
  server `lib/darknet-models.js` cracks (hint rules + model guessers), opens caches, then turns into `workers/darknet-phish.js` with all
  free RAM. Log data/darknet.txt. First run: ~13-20 servers, ~60 phishing threads; phishing pays ~$450/success (mostly charisma XP).
  Unsolved models (log `unknown`): Factori-Os, OpenWebAccessPoint, BellaCuore (roman numeral in data, e.g. XCIX = 99).
  Adding FreshInstall_1.0 + AccountsManager_4.2 guessers took a sweep from 7-11 to 19 servers.
  Darknet files (crawler logs them as `file`): "The password for <host> contains 6 and 8" (clues for other servers),
  "Some common passwords include …" (word lists), "Remember this password: 71", and tips (NIL = "you are one who's'nt
  authorized" probably gives partial feedback, but authenticate only answers 401 → look at heartbleed logs).
  AccountsManager 0-100 got 503 Service Unavailable partway through 100 tries (rate limit or server offline?).
  `services/darknet-crawler.js` is an older unfinished draft (truncated, fails tsc).
- Ideas not started: install helper (aug order/cost/timing from a pasted faction list), stock market
  (user's 2022 forecast strategy: buy >= 0.7, sell < 0.55).
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
  (`root`, `path` for backdoor connect chains, `kill`, `state`, `check-grow`, `usage` = RAM and scripts per server + threads per target, `test-contract-solvers`, `debug-hack-plan`).
- Coding contracts: `lib/contract-solvers.js` (all 30 types; `tools/describe-contract-type.js` fetches the game's description for a type). Verify with `tools/test-contract-solvers.js` (dummy contracts, results in data/contract-solver-test-results.txt) before trusting changes; `services/coding-contracts.js` on home only attempts verified types and blocks a type after one real failure. Log: data/coding-contracts.txt (readable lines via lib/log.js; logs the user reads are text, logs only scripts read stay JSON). First run: 10 solved, ~5k CyberSec rep + $50M.
- Start the hacking service: `node bridge/cli.mjs run start.js [--rep <share fraction>]` (restart: `tools/kill.js <host> services/batcher.js` first; a new batcher adopts in-flight batches by their landing times).
- Use meaningful names (user rule, see ~/.claude/CLAUDE.md).
