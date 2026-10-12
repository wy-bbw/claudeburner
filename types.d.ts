// Makes `/** @param {NS} ns */` work in every script without imports.
type NS = import("./NetscriptDefinitions").NS;
// Game types that JSDoc comments in the scripts refer to by name.
type Server = import("./NetscriptDefinitions").Server;
type Person = import("./NetscriptDefinitions").Person;
type ProcessInfo = import("./NetscriptDefinitions").ProcessInfo;
type DarknetResult = import("./NetscriptDefinitions").DarknetResult;
