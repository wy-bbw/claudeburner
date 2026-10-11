// darknet-map.js: read-only look at the darknet from this server. Probes connected darknet servers,
// reads their details and what a normal scan sees, and writes everything to data/darknet-map-<host>.txt
// (copied to home when run elsewhere).
// Every call is wrapped, so the report also shows which calls need DarkscapeNavigator.exe.
/** @param {NS} ns */
export async function main(ns) {
  const report = {
    time: new Date().toString(),
    runningOn: ns.getHostname(),
    hasDarkscapeNavigator: ns.fileExists("DarkscapeNavigator.exe", "home"),
    hasTorRouter: ns.hasTorRouter(),
    /** @type {Record<string, any>} */
    calls: {},
    /** @type {Record<string, any>} */
    servers: {},
  };
  const attempt = (/** @type {string} */ label, /** @type {() => any} */ call) => {
    try {
      const value = call();
      report.calls[label] = "ok";
      return value;
    } catch (error) {
      report.calls[label] = `ERROR: ${String(error).slice(0, 300)}`;
      return undefined;
    }
  };

  const probed = attempt("probe", () => ns.dnet.probe()) ?? [];
  const scanned = attempt("scan(darkweb)", () => ns.scan("darkweb")) ?? [];
  report.calls.probeResult = probed;
  report.calls.scanOfDarkweb = scanned;
  report.calls.stasisLinkLimit = attempt("getStasisLinkLimit", () => ns.dnet.getStasisLinkLimit());
  report.calls.instability = attempt("getDarknetInstability", () => ns.dnet.getDarknetInstability());

  for (const host of new Set([...probed, ...scanned, "darkweb"])) {
    report.servers[host] = {
      isDarknetServer: attempt(`isDarknetServer(${host})`, () => ns.dnet.isDarknetServer(host)),
      details: attempt(`getServerDetails(${host})`, () => ns.dnet.getServerDetails(host)),
      depth: attempt(`getDepth(${host})`, () => ns.dnet.getDepth(host)),
      requiredCharisma: attempt(`getServerRequiredCharismaLevel(${host})`, () => ns.dnet.getServerRequiredCharismaLevel(host)),
      hasRoot: attempt(`hasRootAccess(${host})`, () => ns.hasRootAccess(host)),
      maxRam: attempt(`getServerMaxRam(${host})`, () => ns.getServerMaxRam(host)),
      usedRam: attempt(`getServerUsedRam(${host})`, () => ns.getServerUsedRam(host)),
      files: attempt(`ls(${host})`, () => ns.ls(host)),
    };
  }
  const here = ns.getHostname();
  const reportFile = `data/darknet-map-${here}.txt`;
  ns.write(reportFile, JSON.stringify(report, null, 1), "w");
  if (here !== "home") ns.scp(reportFile, "home", here); // copying *from* a darknet server is always allowed
  ns.tprint(`darknet map written to ${reportFile} (${Object.keys(report.servers).length} servers)`);
}
