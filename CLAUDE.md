# bitburner-ai

Experiment: playing Bitburner (Steam) with Claude writing all the scripts. Fresh save started 2026-10-11.

## Goal
Fastest progress by **real time**. Start on easy targets, move to harder ones when they pay more net of prep time;
prep the next target in parallel. Verify every model/claim with the metrics sampler (`services/metrics.js` + `bridge/report.mjs`,
baseline vs change, marks in `marks.txt`) — formulas from memory have been wrong before.
Lesson: every server starts at 4% of max money; low-growth targets need hours of prep (sigma-cosmetics ~5 h), n00dles ~1 min.

## Setup
- `node bridge/server.mjs` — Remote API bridge. Game connects to ws://localhost:12525 (Options → Remote API, wss off).
  Pushes `src/**` to `home` on connect and on every change; refreshes `NetscriptDefinitions.d.ts` from the game.
- `node bridge/cli.mjs …` — talks to the bridge (control port 12526): `status | sync | ls | get <file> | ram <file>… | run <script> [-h host] [-t N] [args] | call <method> [json]`.
- After every reset (augmentation install or new BitNode) the user types `run start.js`: it roots, starts the controller on the biggest rooted server, metrics if home has room, then spawns `agent.js` (fits an 8 GB home). `agent.js` must be running on home. It executes `cli run` commands; for remote hosts it scp's all `.js` first.
- Node is at `C:\Program Files\nodejs` — prepend to PATH in shells started before the install.

## Conventions
- Always `npx tsc -p jsconfig.json` before relying on a script: the API drifts between versions (e.g. `ns.formatNumber` → `ns.format.number`). Trust `NetscriptDefinitions.d.ts`, not memory.
- Imports are root-absolute (`lib/net.js`), matching the game's file layout.
- Home RAM resets to 8 GB on a new BitNode: everything must still start on 8 GB (start.js 6.95 GB, agent 3.7 GB). The controller runs on a rooted server and uses home only above `--home-reserve` (16 GB).
- Call port openers explicitly; dynamic `ns[fn]` breaks the RAM calculator.
- The RAM calculator bills any identifier that matches an ns function, also local functions and properties: `flags.share` cost 2.4 GB (ns.share), a helper named `run` cost 1 GB (ns.run). Avoid such names; check `cli ram` after edits.
- `data/state.txt` on home is the controller's JSON snapshot; `tools/state.js` writes a heavier full dump to `data/full-state.txt` (4.7 GB).

## Layout (`src/`, synced to home)
- `start.js`, `agent.js` — top level because the user types them by hand.
- `lib/` shared code · `workers/` single-operation jobs (hack, grow, weaken, share), started only by the controller ·
  `services/` long-running (`controller.js` on a rooted server; on home: `metrics.js`, `coding-contracts.js`, `server-buyer.js` = ns.cloud servers, buys only after TOR + BruteSSH..HTTPWorm are owned (cheaper RAM per GB) and when <10% thread slots are free) · `tools/` one-shots
  (`root`, `path` for backdoor connect chains, `kill`, `state`, `check-grow`, `usage` = RAM and scripts per server + threads per target, `test-contract-solvers`, `debug-hack-plan`).
- Coding contracts: `lib/contract-solvers.js` (29 of 30 types; Largest Rectangle in a Matrix missing). Verify with `tools/test-contract-solvers.js` (dummy contracts, results in data/contract-tests.txt) before trusting changes; `services/coding-contracts.js` on home only attempts verified types and blocks a type after one real failure. Log: data/coding-contracts.txt. First run: 10 solved, ~5k CyberSec rep + $50M.
- Start the controller: `node bridge/cli.mjs run services/controller.js -h harakiri-sushi --rep <share fraction>`.
- Use meaningful names (user rule, see ~/.claude/CLAUDE.md).
