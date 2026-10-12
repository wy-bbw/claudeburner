// Password guessers for darknet server models. The model list is deliberately undocumented,
// so every guesser is a hypothesis; the comment names the evidence that verified it.

/** @typedef {ReturnType<NS["dnet"]["getServerDetails"]>} DarknetDetails */

/**
 * Every password worth trying, most likely first: the hint rules, then the model guessers.
 * @param {DarknetDetails} details
 * @returns {string[]}
 */
export function passwordCandidates(details) {
  return [...new Set([...hintPasswords(details), ...guessPasswords(details)])];
}

/**
 * Passwords the hint text states or implies, whatever the model (rules collected by hand from run_darknet.js).
 * @param {DarknetDetails} details
 * @returns {string[]}
 */
export function hintPasswords(details) {
  const hint = details.passwordHint;
  const textAfter = (/** @type {string} */ marker) => hint.split(marker)[1];
  const fourDigits = details.passwordLength === 4 && details.passwordFormat === "numeric";
  if (details.passwordLength === 0) return [""];
  if (hint.includes("The key is ")) return [textAfter("The key is ")];
  if (hint.includes("Remember to use ")) return [textAfter("Remember to use ")];
  if (hint.includes("The default password is set")) return ["admin"];
  if (hint.includes("The PIN is ")) return [textAfter("The PIN is ")];
  if (hint.includes("The secret is ")) return [textAfter("The secret is ")];
  if (hint.includes("Type the numbers to prove")) return [details.data.replace(/\D/g, "")];
  if (hint.includes("The password is the default password")) {
    if (details.passwordLength === 8) return ["password"];
    if (details.passwordLength === 5 && details.passwordFormat === "numeric") return ["12345"];
    if (fourDigits) return ["0000"];
  }
  if (hint.includes("It's still the default") && fourDigits) return ["0000"];
  return [];
}

/**
 * Password candidates for a darknet server, most likely first. Empty when the model is unknown.
 * @param {DarknetDetails} details
 * @returns {string[]}
 */
export function guessPasswords(details) {
  const hintNumbers = details.passwordHint.match(/\d+/g) ?? [];
  const dataDigits = (details.data.match(/\d/g) ?? []).join("");
  switch (details.modelId) {
    case "ZeroLogon": // "There is no password" / "The PIN is empty" (verified 2026-10-11)
      return [""];
    case "DeskMemo_3.1": // "The key is 527": the hint states it (verified)
      return hintNumbers.filter((number) => number.length === details.passwordLength);
    case "PHP 5.4": // "The PIN uses 237": some order of those digits (verified: 273)
      return [...new Set(permutations((hintNumbers[0] ?? dataDigits).split("")).map((digits) => digits.join("")))];
    case "CloudBlare(tm)": // captcha: the digits hidden in the noise, in order (verified)
      return [dataDigits];
    case "AccountsManager_4.2": { // "The password is a number between 0 and 10": every number in the range that fits (verified: no failed logins since)
      // "between 0 and 100" with 2 digits failed for 10..99: hypothesis that small numbers are zero-padded ("07")
      const [low, high] = hintNumbers.map(Number);
      if (low === undefined || high === undefined) return [];
      return Array.from({ length: high - low + 1 }, (_, index) => String(low + index))
        .filter((number) => number.length <= details.passwordLength)
        .map((number) => number.padStart(details.passwordLength, "0"));
    }
    case "FreshInstall_1.0": // "It's still the factory settings" / "I never changed the password": a default that fits (verified: no failed logins since)
      return DEFAULT_PASSWORDS.filter((password) => password.length === details.passwordLength && fitsFormat(password, details.passwordFormat));
    case "BellaCuore": { // "The password is the value of the number 'XCIX'", data "XCIX": the roman numeral's value
      const value = romanToNumber(details.data.trim());
      return value === undefined ? [] : [String(value)];
    }
    default:
      return [];
  }
}

// Factory passwords, most common first; FreshInstall servers keep one that fits their length and format.
const DEFAULT_PASSWORDS = ["admin", "password", "12345", "0000", "1234", "guest", "root", "default"];

/** @param {string} password @param {string} format */
function fitsFormat(password, format) {
  if (format === "numeric") return /^\d+$/.test(password);
  if (format === "alphabetic") return /^[a-z]+$/i.test(password);
  if (format === "alphanumeric") return /^[a-z0-9]+$/i.test(password);
  return true;
}

const ROMAN_DIGITS = /** @type {Record<string, number>} */ ({ I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 });

/** "XCIX" -> 99; undefined if it isn't a roman numeral. @param {string} numeral */
export function romanToNumber(numeral) {
  const upper = numeral.toUpperCase();
  if (!/^[IVXLCDM]+$/.test(upper)) return undefined;
  let total = 0;
  for (let index = 0; index < upper.length; index++) {
    const value = ROMAN_DIGITS[upper[index]];
    const next = ROMAN_DIGITS[upper[index + 1]] ?? 0;
    total += value < next ? -value : value; // a smaller digit before a bigger one subtracts (IX = 9)
  }
  return total;
}

/** @template T @param {T[]} items @returns {T[][]} */
function permutations(items) {
  if (items.length <= 1) return [items];
  return items.flatMap((item, index) => permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [item, ...rest]));
}
