// Collects the dashboard's data from files on home (read through the Remote API):
//   data/metrics.txt          one JSON sample every 10 s (services/metrics.js): income over time, hacking level
//   data/state.txt            the batcher's JSON snapshot: threads, share, counters, targets
//   data/darknet.txt          services/darknet-orchestrator.js log: sweep summaries and events
//   data/coding-contracts.txt services/coding-contracts.js log: solved contracts and rewards
// Every field is optional on the page: a missing file (service not running) yields null.

const INCOME_HISTORY_MINUTES = 120;
const SAMPLES_PER_POINT = 6; // 6 samples of 10 s = one income point per minute

/** @param {(method: string, params: object) => Promise<any>} call */
export async function collectDashboardData(call) {
  const readFile = async (filename) => {
    try {
      const content = await call("getFile", { filename, server: "home" });
      return typeof content === "string" && content.length ? content : null;
    } catch {
      return null;
    }
  };
  const [metricsText, stateText, darknetText, contractsText, corpStateText, corpHistoryText] = await Promise.all(
    ["data/metrics.txt", "data/state.txt", "data/darknet.txt", "data/coding-contracts.txt", "data/corp-state.txt", "data/corp-history.txt"].map(readFile));
  return {
    time: Date.now(),
    income: metricsText ? incomeFromMetrics(metricsText) : null,
    hacking: stateText ? hackingFromState(stateText) : null,
    darknet: darknetText ? darknetFromLog(darknetText) : null,
    contracts: contractsText ? contractsFromLog(contractsText) : null,
    corporation: corpStateText ? corporationFromState(corpStateText, corpHistoryText) : null,
  };
}

/** services/corp-status.js snapshot plus the last 2 h of history (one line per 20 s). */
function corporationFromState(stateText, historyText) {
  let state;
  try { state = JSON.parse(stateText); } catch { return null; }
  const cutoff = Date.now() - INCOME_HISTORY_MINUTES * 60_000;
  const history = (historyText ?? "").split("\n").filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  }).filter((point) => point.t >= cutoff);
  return { ...state, history };
}

/** Income per minute from the cumulative hack money; skips gaps and resets (augmentation installs). */
function incomeFromMetrics(text) {
  const samples = text.split("\n").filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
  const cutoff = Date.now() - INCOME_HISTORY_MINUTES * 60_000;
  const rates = [];
  for (let index = 1; index < samples.length; index++) {
    const previous = samples[index - 1], current = samples[index];
    const seconds = (current.t - previous.t) / 1000;
    const gained = current.hackMoney - previous.hackMoney;
    if (current.t < cutoff || seconds <= 0 || seconds > 60 || gained < 0) continue;
    rates.push({ t: current.t, perSecond: gained / seconds });
  }
  const points = [];
  for (let start = 0; start < rates.length; start += SAMPLES_PER_POINT) {
    const group = rates.slice(start, start + SAMPLES_PER_POINT);
    points.push({ t: group[group.length - 1].t, perSecond: group.reduce((sum, rate) => sum + rate.perSecond, 0) / group.length });
  }
  const latest = samples[samples.length - 1];
  const lastMinute = rates.slice(-SAMPLES_PER_POINT);
  return {
    points,
    nowPerSecond: lastMinute.length ? lastMinute.reduce((sum, rate) => sum + rate.perSecond, 0) / lastMinute.length : null,
    hackingLevel: latest?.lvl ?? null,
    money: latest?.money ?? null,
    sampleTime: latest?.t ?? null,
  };
}

function hackingFromState(text) {
  let state;
  try { state = JSON.parse(text); } catch { return null; }
  const targets = (state.targets ?? [])
    .filter((target) => target.mode !== "idle")
    .sort((a, b) => (b.modelledMoneyPerSecond ?? 0) - (a.modelledMoneyPerSecond ?? 0))
    .map((target) => ({
      target: target.target,
      mode: target.mode,
      moneyPerSecond: target.modelledMoneyPerSecond ?? 0,
      hackPercent: Math.round((target.hackFraction ?? 0) * 100),
      threads: target.runningThreads ?? 0,
      moneyPercent: target.moneyPercent ?? null,
    }));
  const modeCounts = {};
  for (const target of state.targets ?? []) modeCounts[target.mode] = (modeCounts[target.mode] ?? 0) + 1;
  return {
    stateTime: state.time,
    threads: state.threads,
    share: state.share,
    counters: state.counters,
    modeCounts,
    targets,
  };
}

/** Log lines look like "2026-10-11 20:32:27  sweep     13 darknet servers reached, …". */
function parseLogLine(line) {
  const match = line.match(/^(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d)\s+(\S+)\s+(.*)$/);
  return match ? { time: match[1], type: match[2], details: match[3] } : null;
}

function darknetFromLog(text) {
  const lines = text.split("\n").map(parseLogLine).filter(Boolean);
  const sweeps = lines.filter((line) => line.type === "sweep").flatMap((line) => {
    const match = line.details.match(/(\d+) darknet servers reached, (\d+) phishing with (\d+) threads, (\d+)\/(\d+) attempts successful, karma (-?\d+)/);
    if (!match) return [];
    const [, reached, phishers, threads, successes, attempts, karma] = match.map(Number);
    return [{ time: line.time, reached, phishers, threads, successes, attempts, karma }];
  });
  const counts = {};
  for (const line of lines) counts[line.type] = (counts[line.type] ?? 0) + 1;
  return {
    sweeps: sweeps.slice(-60),
    counts,
    recentCaches: lines.filter((line) => line.type === "cache").slice(-8).reverse(),
    recentEvents: lines.filter((line) => line.type !== "sweep" && line.type !== "cache").slice(-12).reverse(),
  };
}

function contractsFromLog(text) {
  const solved = text.split("\n").map(parseLogLine).filter((line) => line && line.type === "solved");
  const failed = text.split("\n").map(parseLogLine).filter((line) => line && line.type === "failed");
  const rewardKind = (details) => {
    if (/company reputation/.test(details)) return "company reputation";
    if (/reputation/.test(details)) return "faction reputation";
    if (/\$/.test(details)) return "money";
    return "other";
  };
  const byReward = {};
  for (const line of solved) {
    const kind = rewardKind(line.details);
    byReward[kind] = (byReward[kind] ?? 0) + 1;
  }
  return {
    solved: solved.length,
    failed: failed.length,
    byReward,
    recent: solved.slice(-8).reverse(),
  };
}
