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
- In game, `agent.js` must be running on home (user types `run agent.js` after each reset). It executes `cli run` commands; for remote hosts it scp's all `.js` first.
- Node is at `C:\Program Files\nodejs` — prepend to PATH in shells started before the install.

## Conventions
- Always `npx tsc -p jsconfig.json` before relying on a script: the API drifts between versions (e.g. `ns.formatNumber` → `ns.format.number`). Trust `NetscriptDefinitions.d.ts`, not memory.
- Imports are root-absolute (`lib/net.js`), matching the game's file layout.
- Home is tiny early on: keep only `agent.js` there, run heavy scripts on rooted servers via `-h`.
- Call port openers explicitly; dynamic `ns[fn]` breaks the RAM calculator.
- The RAM calculator bills any `.name` that matches an ns function (`flags.share` cost 2.4 GB as ns.share). Avoid such property names; check `cli ram` after edits.
- `data/state.txt` on home is the controller's JSON snapshot; `tools/state.js` is a heavier full dump (4.7 GB).

## Layout (`src/`, synced to home)
- `agent.js` — top level because the user types `run agent.js` after each reset.
- `lib/` shared code · `workers/` single-operation jobs (hack, grow, weaken, share), started only by the controller ·
  `services/` long-running (`controller.js` on a rooted server, `metrics.js` on n00dles) · `tools/` one-shots
  (`root`, `path` for backdoor connect chains, `kill`, `state`, `check-grow`).
- Start the controller: `node bridge/cli.mjs run services/controller.js -h harakiri-sushi --rep <share fraction>`.
- Use meaningful names (user rule, see ~/.claude/CLAUDE.md).
