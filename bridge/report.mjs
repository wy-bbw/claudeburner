// Summarise data/metrics.txt from the game.
//   node bridge/report.mjs [minutes-per-bucket=5] [since=<label or epoch ms>]
// Labels come from data/marks.txt lines "<epoch ms> <label>" written by `report.mjs mark <label>`.
import fs from "node:fs";

const CTRL = `http://127.0.0.1:${process.env.BB_CTRL_PORT ?? 12526}`;
const MARKS = new URL("../marks.txt", import.meta.url);

async function getFile(filename) {
  const res = await fetch(CTRL + "/call", {
    method: "POST",
    body: JSON.stringify({ method: "getFile", params: { filename, server: "home" } }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json.result;
}

const fmt = (n) => {
  const a = Math.abs(n);
  for (const [d, s] of [[1e12, "t"], [1e9, "b"], [1e6, "m"], [1e3, "k"]]) if (a >= d) return (n / d).toFixed(2) + s;
  return n.toFixed(2);
};

const [arg0, arg1] = process.argv.slice(2);
if (arg0 === "mark") {
  fs.appendFileSync(MARKS, `${Date.now()} ${arg1 ?? "mark"}\n`);
  console.log("marked", arg1);
  process.exit(0);
}

const marks = fs.existsSync(MARKS)
  ? fs.readFileSync(MARKS, "utf8").trim().split("\n").filter(Boolean).map((l) => {
      const [t, ...rest] = l.split(" ");
      return { t: Number(t), label: rest.join(" ") };
    })
  : [];

const bucketMin = Number(arg0 ?? 5);
const since = arg1 ? (marks.find((m) => m.label === arg1)?.t ?? Number(arg1)) : 0;
const samples = (await getFile("data/metrics.txt"))
  .trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((s) => s.t >= since);
if (samples.length < 2) {
  console.log(`only ${samples.length} sample(s) so far`);
  process.exit(0);
}

const rate = (a, b, k) => (b[k] - a[k]) / ((b.t - a.t) / 1000);
const time = (t) => new Date(t).toLocaleTimeString();

console.log("from      to        lvl      $/s(hack)   xp/s   target          target $ min..max     sec min..max");
for (let i = 0; i < samples.length - 1; ) {
  const start = samples[i];
  let j = i + 1;
  while (j < samples.length - 1 && samples[j].t - start.t < bucketMin * 60000) j++;
  const win = samples.slice(i, j + 1);
  const end = samples[j];
  const mark = marks.filter((m) => m.t > start.t && m.t <= end.t).map((m) => `  <- ${m.label}`).join("");
  console.log(
    `${time(start.t)}  ${time(end.t)}  ${String(start.lvl).padStart(3)}->${String(end.lvl).padEnd(4)}` +
      ` ${fmt(rate(start, end, "hackMoney")).padStart(10)}  ${rate(start, end, "xp").toFixed(2).padStart(6)}` +
      `   ${end.target.padEnd(15)} ${fmt(Math.min(...win.map((s) => s.tMoney))).padStart(8)}..${fmt(Math.max(...win.map((s) => s.tMoney))).padEnd(8)}` +
      `  ${Math.min(...win.map((s) => s.tSec)).toFixed(1)}..${Math.max(...win.map((s) => s.tSec)).toFixed(1)}${mark}`,
  );
  i = j;
}
const a = samples[0], b = samples.at(-1);
console.log(`\ntotal ${((b.t - a.t) / 60000).toFixed(1)} min: $/s ${fmt(rate(a, b, "hackMoney"))}, xp/s ${rate(a, b, "xp").toFixed(2)}`);
