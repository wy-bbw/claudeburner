// Talk to the running bridge.
//   node bridge/cli.mjs status
//   node bridge/cli.mjs sync                      re-pull defs, re-push src/
//   node bridge/cli.mjs ls                        files on home
//   node bridge/cli.mjs get <file>                print a file from home
//   node bridge/cli.mjs ram <file>...             RAM cost of scripts on home
//   node bridge/cli.mjs run <script> [-h host] [-t N] [args...]   queue a script for agent.js
//   node bridge/cli.mjs call <method> [jsonParams]
const CTRL = `http://127.0.0.1:${process.env.BB_CTRL_PORT ?? 12526}`;

async function post(endpoint, body) {
  const res = await fetch(CTRL + endpoint, { method: "POST", body: JSON.stringify(body ?? {}) });
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json;
}
const rpc = async (method, params) => (await post("/call", { method, params })).result;

const [cmd, ...rest] = process.argv.slice(2);
try {
  switch (cmd) {
    case "status": console.log(await post("/status")); break;
    case "sync": console.log(await post("/sync")); break;
    case "ls": console.log((await rpc("getFileNames", { server: "home" })).join("\n")); break;
    case "get": console.log(await rpc("getFile", { filename: rest[0], server: "home" })); break;
    case "ram":
      for (const filename of rest) console.log(filename, await rpc("calculateRam", { filename, server: "home" }));
      break;
    case "run": {
      const opt = (flag, dflt) => {
        const i = rest.indexOf(flag);
        return i >= 0 ? rest.splice(i, 2)[1] : dflt;
      };
      const threads = Number(opt("-t", 1));
      const host = opt("-h", "home");
      const [script, ...args] = rest;
      console.log(await post("/run", { script, host, threads, args: args.map((a) => (isNaN(a) ? a : Number(a))) }));
      break;
    }
    case "call": console.log(JSON.stringify(await rpc(rest[0], rest[1] ? JSON.parse(rest[1]) : {}), null, 2)); break;
    default: console.log("usage: status | sync | ls | get <file> | run <script> [-t N] [args] | call <method> [json]");
  }
} catch (e) {
  console.error("error:", e.message);
  process.exit(1);
}
