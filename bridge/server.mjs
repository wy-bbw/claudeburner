// Bitburner Remote API bridge.
// - The game connects to ws://localhost:GAME_PORT (Options -> Remote API).
// - Everything under src/ is pushed to "home" on connect and on every change.
// - NetscriptDefinitions.d.ts is refreshed from the game on connect.
// - A local HTTP control port lets bridge/cli.mjs issue RPC calls and queue
//   commands for the in-game agent.js (the Remote API cannot run scripts).
import { WebSocketServer } from "ws";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");
const GAME_PORT = Number(process.env.BB_PORT ?? 12525);
const CTRL_PORT = Number(process.env.BB_CTRL_PORT ?? 12526);
const SYNC_EXT = /\.(js|txt)$/;
const INBOX = "cmd/inbox.txt";

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ---- JSON-RPC to the game -------------------------------------------------
let game = null;
let nextId = 1;
const pending = new Map();

function call(method, params = {}) {
  if (!game) return Promise.reject(new Error("game not connected"));
  const id = nextId++;
  game.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`${method} timed out`));
    }, 15000);
    pending.set(id, { resolve, reject, timer });
  });
}

function onMessage(data) {
  let msg;
  try { msg = JSON.parse(data.toString()); } catch { return log("bad message", String(data).slice(0, 200)); }
  const p = pending.get(msg.id);
  if (!p) return;
  pending.delete(msg.id);
  clearTimeout(p.timer);
  if (msg.error !== undefined) p.reject(new Error(typeof msg.error === "string" ? msg.error : JSON.stringify(msg.error)));
  else p.resolve(msg.result);
}

// ---- file sync ------------------------------------------------------------
const toGamePath = (abs) => path.relative(SRC, abs).split(path.sep).join("/");

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

async function push(abs) {
  const filename = toGamePath(abs);
  const content = fs.readFileSync(abs, "utf8");
  await call("pushFile", { filename, content, server: "home" });
  log("pushed", filename);
}

async function pushAll() {
  for (const f of walk(SRC).filter((f) => SYNC_EXT.test(f))) {
    try { await push(f); } catch (e) { log("push failed", toGamePath(f), e.message); }
  }
}

async function refreshDefs() {
  const defs = await call("getDefinitionFile");
  fs.writeFileSync(path.join(ROOT, "NetscriptDefinitions.d.ts"), defs);
  log("updated NetscriptDefinitions.d.ts");
}

// src/ is the source of truth. The in-game editor can write stale copies back
// (open tabs are saved on close), so periodically compare and re-push.
const norm = (s) => s.replace(/\r\n/g, "\n");
async function checkDrift() {
  if (!game) return;
  try {
    const inGame = new Map((await call("getAllFiles", { server: "home" })).map((f) => [f.filename, f.content]));
    for (const abs of walk(SRC).filter((f) => SYNC_EXT.test(f))) {
      const name = toGamePath(abs);
      if (norm(inGame.get(name) ?? "") !== norm(fs.readFileSync(abs, "utf8"))) {
        log("DRIFT", name, "differs in game, re-pushing");
        await push(abs);
      }
    }
  } catch (e) { log("drift check failed:", e.message); }
}
setInterval(checkDrift, 15000);

const debounce = new Map();
fs.mkdirSync(SRC, { recursive: true });
fs.watch(SRC, { recursive: true }, (_ev, name) => {
  if (!name || !SYNC_EXT.test(name)) return;
  const abs = path.join(SRC, name);
  clearTimeout(debounce.get(abs));
  debounce.set(abs, setTimeout(async () => {
    debounce.delete(abs);
    if (!game) return;
    try {
      if (fs.existsSync(abs)) await push(abs);
      else {
        await call("deleteFile", { filename: toGamePath(abs), server: "home" });
        log("deleted", toGamePath(abs));
      }
    } catch (e) { log("sync failed", name, e.message); }
  }, 150));
});

// ---- command queue for agent.js ------------------------------------------
// seq is time-based so it keeps increasing across bridge restarts;
// agent.js persists the last seq it executed.
let commands = [];
let lastSeq = 0;

async function enqueue(cmd) {
  const seq = Math.max(Date.now(), lastSeq + 1);
  lastSeq = seq;
  commands = [...commands, { seq, ...cmd }].slice(-20);
  await call("pushFile", { filename: INBOX, content: JSON.stringify(commands), server: "home" });
  return seq;
}

// ---- servers --------------------------------------------------------------
const wss = new WebSocketServer({ port: GAME_PORT });
wss.on("connection", async (ws) => {
  if (game) game.close();
  game = ws;
  log("game connected");
  ws.on("message", onMessage);
  ws.on("close", () => {
    if (game === ws) game = null;
    log("game disconnected");
  });
  try {
    await refreshDefs();
    await pushAll();
  } catch (e) { log("initial sync failed:", e.message); }
});
log(`waiting for game on ws://localhost:${GAME_PORT}`);

http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", async () => {
    const reply = (code, obj) => {
      res.writeHead(code, { "content-type": "application/json" });
      res.end(JSON.stringify(obj));
    };
    try {
      if (req.url === "/status") return reply(200, { connected: !!game });
      const req_ = body ? JSON.parse(body) : {};
      if (req.url === "/call") return reply(200, { result: await call(req_.method, req_.params) });
      if (req.url === "/run") return reply(200, { seq: await enqueue(req_) });
      if (req.url === "/sync") { await refreshDefs(); await pushAll(); return reply(200, { ok: true }); }
      reply(404, { error: "unknown endpoint" });
    } catch (e) { reply(500, { error: e.message }); }
  });
}).listen(CTRL_PORT, "127.0.0.1", () => log(`control on http://127.0.0.1:${CTRL_PORT}`));
