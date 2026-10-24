// Solvers for coding contracts, keyed by contract type (ns.enums.CodingContractName values).
// Each takes the contract's data and returns the answer in the shape the game expects.
// Verify with tools/coding-contracts/test-solvers.js (dummy contracts, no reward) before trusting one.

/** @type {Record<string, (data: any) => any>} */
export const CONTRACT_SOLVERS = {
  "Find Largest Prime Factor": largestPrimeFactor,
  "Subarray with Maximum Sum": maxSubarraySum,
  "Total Ways to Sum": (n) => waysToSum(n, range(1, n - 1)),
  "Total Ways to Sum II": ([n, parts]) => waysToSum(n, parts),
  "Spiralize Matrix": spiralize,
  "Array Jumping Game": (jumps) => (minJumps(jumps) >= 0 ? 1 : 0),
  "Array Jumping Game II": (jumps) => Math.max(0, minJumps(jumps)),
  "Merge Overlapping Intervals": mergeIntervals,
  "Generate IP Addresses": generateIpAddresses,
  "Algorithmic Stock Trader I": (prices) => maxStockProfit(1, prices),
  "Algorithmic Stock Trader II": (prices) => maxStockProfit(prices.length, prices),
  "Algorithmic Stock Trader III": (prices) => maxStockProfit(2, prices),
  "Algorithmic Stock Trader IV": ([maxTrades, prices]) => maxStockProfit(maxTrades, prices),
  "Minimum Path Sum in a Triangle": minTrianglePathSum,
  "Unique Paths in a Grid I": ([rows, columns]) => countGridPaths(Array.from({ length: rows }, () => Array(columns).fill(0))),
  "Unique Paths in a Grid II": countGridPaths,
  "Shortest Path in a Grid": shortestGridPath,
  "Sanitize Parentheses in Expression": sanitizeParentheses,
  "Find All Valid Math Expressions": ([digits, target]) => validMathExpressions(digits, target),
  "HammingCodes: Integer to Encoded Binary": hammingEncode,
  "HammingCodes: Encoded Binary to Integer": hammingDecode,
  "Proper 2-Coloring of a Graph": ([vertexCount, edges]) => twoColorGraph(vertexCount, edges),
  "Compression I: RLE Compression": runLengthEncode,
  "Compression II: LZ Decompression": lzDecompress,
  "Compression III: LZ Compression": lzCompress,
  "Encryption I: Caesar Cipher": ([plaintext, shift]) => caesarEncrypt(plaintext, shift),
  "Encryption II: Vigenère Cipher": ([plaintext, keyword]) => vigenereEncrypt(plaintext, keyword),
  "Square Root": roundedSquareRoot,
  "Total Number of Primes": ([low, high]) => countPrimes(low, high),
  "Largest Rectangle in a Matrix": largestZeroRectangle,
};

/** @param {number} from @param {number} to */
function range(from, to) {
  return Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);
}

/** @param {number} number */
function largestPrimeFactor(number) {
  let remaining = number, largest = 1;
  for (let factor = 2; factor * factor <= remaining; factor++) {
    while (remaining % factor === 0) {
      largest = factor;
      remaining /= factor;
    }
  }
  return remaining > 1 ? remaining : largest;
}

/** Kadane: best sum of a non-empty contiguous subarray. @param {number[]} values */
function maxSubarraySum(values) {
  let best = values[0], endingHere = values[0];
  for (const value of values.slice(1)) {
    endingHere = Math.max(value, endingHere + value);
    best = Math.max(best, endingHere);
  }
  return best;
}

/** Number of ways to write total as a sum of the given parts (each usable any number of times). @param {number} total @param {number[]} parts */
function waysToSum(total, parts) {
  const ways = Array(total + 1).fill(0);
  ways[0] = 1;
  for (const part of parts) for (let sum = part; sum <= total; sum++) ways[sum] += ways[sum - part];
  return ways[total];
}

/** @param {number[][]} matrix */
function spiralize(matrix) {
  const result = [];
  let top = 0, bottom = matrix.length - 1, left = 0, right = (matrix[0]?.length ?? 0) - 1;
  while (top <= bottom && left <= right) {
    for (let column = left; column <= right; column++) result.push(matrix[top][column]);
    top++;
    for (let row = top; row <= bottom; row++) result.push(matrix[row][right]);
    right--;
    if (top <= bottom) {
      for (let column = right; column >= left; column--) result.push(matrix[bottom][column]);
      bottom--;
    }
    if (left <= right) {
      for (let row = bottom; row >= top; row--) result.push(matrix[row][left]);
      left++;
    }
  }
  return result;
}

/** Fewest jumps from the first to the last index (value = max jump length), or -1 if unreachable. @param {number[]} jumps */
function minJumps(jumps) {
  if (jumps.length <= 1) return 0;
  let count = 0, currentEnd = 0, farthest = 0;
  for (let index = 0; index < jumps.length - 1; index++) {
    if (index > farthest) return -1;
    farthest = Math.max(farthest, index + jumps[index]);
    if (index === currentEnd) {
      if (farthest <= index) return -1;
      count++;
      currentEnd = farthest;
      if (currentEnd >= jumps.length - 1) return count;
    }
  }
  return currentEnd >= jumps.length - 1 ? count : -1;
}

/** Touching intervals ([1,3],[3,5]) merge too. @param {number[][]} intervals */
function mergeIntervals(intervals) {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  /** @type {number[][]} */
  const merged = [];
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

/** @param {string} digits */
function generateIpAddresses(digits) {
  const isOctet = (/** @type {string} */ part) => part.length > 0 && part.length <= 3 && (part === "0" || part[0] !== "0") && Number(part) <= 255;
  const addresses = [];
  for (let a = 1; a <= 3; a++) for (let b = 1; b <= 3; b++) for (let c = 1; c <= 3; c++) {
    const d = digits.length - a - b - c;
    if (d < 1 || d > 3) continue;
    const parts = [digits.slice(0, a), digits.slice(a, a + b), digits.slice(a + b, a + b + c), digits.slice(a + b + c)];
    if (parts.every(isOctet)) addresses.push(parts.join("."));
  }
  return addresses;
}

/** Max profit with at most maxTrades buy/sell pairs. @param {number} maxTrades @param {number[]} prices */
function maxStockProfit(maxTrades, prices) {
  if (prices.length < 2 || maxTrades < 1) return 0;
  const trades = Math.min(maxTrades, Math.floor(prices.length / 2));
  const holding = Array(trades + 1).fill(-Infinity);
  const sold = Array(trades + 1).fill(0);
  for (const price of prices) {
    for (let trade = trades; trade >= 1; trade--) {
      sold[trade] = Math.max(sold[trade], holding[trade] + price);
      holding[trade] = Math.max(holding[trade], sold[trade - 1] - price);
    }
  }
  return Math.max(...sold);
}

/** @param {number[][]} triangle */
function minTrianglePathSum(triangle) {
  const best = [...triangle[triangle.length - 1]];
  for (let row = triangle.length - 2; row >= 0; row--) {
    for (let column = 0; column <= row; column++) best[column] = triangle[row][column] + Math.min(best[column], best[column + 1]);
  }
  return best[0];
}

/** Right/down paths from top-left to bottom-right avoiding 1s. @param {number[][]} grid */
function countGridPaths(grid) {
  const columns = grid[0].length;
  const paths = Array(columns).fill(0);
  paths[0] = 1;
  for (const row of grid) {
    for (let column = 0; column < columns; column++) {
      if (row[column] === 1) paths[column] = 0;
      else if (column > 0) paths[column] += paths[column - 1];
    }
  }
  return paths[columns - 1];
}

/** BFS over open cells (0); answer is a U/D/L/R string, "" if unreachable. @param {number[][]} grid */
function shortestGridPath(grid) {
  const rows = grid.length, columns = grid[0].length;
  if (grid[0][0] === 1 || grid[rows - 1][columns - 1] === 1) return "";
  const moves = [[-1, 0, "U"], [1, 0, "D"], [0, -1, "L"], [0, 1, "R"]];
  /** @type {(string | null)[][]} */
  const pathTo = Array.from({ length: rows }, () => Array(columns).fill(null));
  pathTo[0][0] = "";
  const queue = [[0, 0]];
  for (let head = 0; head < queue.length; head++) {
    const [row, column] = queue[head];
    if (row === rows - 1 && column === columns - 1) return pathTo[row][column];
    for (const [dRow, dColumn, letter] of moves) {
      const nextRow = row + Number(dRow), nextColumn = column + Number(dColumn);
      if (nextRow < 0 || nextColumn < 0 || nextRow >= rows || nextColumn >= columns) continue;
      if (grid[nextRow][nextColumn] === 1 || pathTo[nextRow][nextColumn] !== null) continue;
      pathTo[nextRow][nextColumn] = (pathTo[row][column] ?? "") + letter;
      queue.push([nextRow, nextColumn]);
    }
  }
  return "";
}

/** All distinct strings reachable by removing the fewest parentheses that are balanced. @param {string} expression */
function sanitizeParentheses(expression) {
  const isBalanced = (/** @type {string} */ text) => {
    let open = 0;
    for (const character of text) {
      if (character === "(") open++;
      else if (character === ")" && --open < 0) return false;
    }
    return open === 0;
  };
  let level = new Set([expression]);
  while (level.size > 0) {
    const valid = [...level].filter(isBalanced);
    if (valid.length > 0) return valid;
    /** @type {Set<string>} */
    const next = new Set();
    for (const text of level) {
      for (let index = 0; index < text.length; index++) {
        if (text[index] === "(" || text[index] === ")") next.add(text.slice(0, index) + text.slice(index + 1));
      }
    }
    level = next;
  }
  return [""];
}

/** Insert +, -, * between digits (no multi-digit operands with a leading 0) to reach target. @param {string} digits @param {number} target */
function validMathExpressions(digits, target) {
  /** @type {string[]} */
  const results = [];
  /** @param {number} index @param {string} expression @param {number} value @param {number} lastTerm */
  const search = (index, expression, value, lastTerm) => {
    if (index === digits.length) {
      if (value === target) results.push(expression);
      return;
    }
    for (let end = index + 1; end <= digits.length; end++) {
      const operandText = digits.slice(index, end);
      if (operandText.length > 1 && operandText[0] === "0") break;
      const operand = Number(operandText);
      if (index === 0) {
        search(end, operandText, operand, operand);
        continue;
      }
      search(end, `${expression}+${operandText}`, value + operand, operand);
      search(end, `${expression}-${operandText}`, value - operand, -operand);
      search(end, `${expression}*${operandText}`, value - lastTerm + lastTerm * operand, lastTerm * operand);
    }
  };
  search(0, "", 0, 0);
  return results;
}

/** Extended Hamming code as the game builds it: bit 0 = overall parity, powers of two = parity bits. @param {number} value */
function hammingEncode(value) {
  const dataBits = value.toString(2).split("").map(Number); // most significant first
  /** @type {number[]} */
  const encoded = [0];
  for (let position = 1, next = 0; next < dataBits.length; position++) {
    encoded[position] = (position & (position - 1)) === 0 ? 0 : dataBits[next++];
  }
  let parityIndex = 0;
  encoded.forEach((bit, position) => { if (bit) parityIndex ^= position; });
  for (let i = 0; 2 ** i < encoded.length; i++) encoded[2 ** i] = (parityIndex >> i) & 1;
  encoded[0] = encoded.reduce((sum, bit) => sum + bit, 0) % 2;
  return encoded.join("");
}

/** Corrects a single flipped bit, then reads the data bits back. @param {string} encoded */
function hammingDecode(encoded) {
  const bits = encoded.split("").map(Number);
  let errorPosition = 0;
  bits.forEach((bit, position) => { if (bit) errorPosition ^= position; });
  if (errorPosition) bits[errorPosition] ^= 1;
  let dataBits = "";
  for (let position = 1; position < bits.length; position++) if ((position & (position - 1)) !== 0) dataBits += bits[position];
  return parseInt(dataBits, 2);
}

/** Colors 0/1 with no edge joining equal colors, vertex 0 colored 0; [] if impossible. @param {number} vertexCount @param {number[][]} edges */
function twoColorGraph(vertexCount, edges) {
  /** @type {number[][]} */
  const neighbours = Array.from({ length: vertexCount }, () => []);
  for (const [a, b] of edges) {
    neighbours[a].push(b);
    neighbours[b].push(a);
  }
  const colors = Array(vertexCount).fill(-1);
  for (let start = 0; start < vertexCount; start++) {
    if (colors[start] !== -1) continue;
    colors[start] = 0;
    const queue = [start];
    for (let head = 0; head < queue.length; head++) {
      const vertex = queue[head];
      for (const neighbour of neighbours[vertex]) {
        if (colors[neighbour] === -1) {
          colors[neighbour] = 1 - colors[vertex];
          queue.push(neighbour);
        } else if (colors[neighbour] === colors[vertex]) return [];
      }
    }
  }
  return colors;
}

/** Runs longer than 9 are split: "aaaaaaaaaaaa" -> "9a3a". @param {string} text */
function runLengthEncode(text) {
  let encoded = "";
  for (let index = 0; index < text.length;) {
    let runLength = 1;
    while (runLength < 9 && text[index + runLength] === text[index]) runLength++;
    encoded += runLength + text[index];
    index += runLength;
  }
  return encoded;
}

/** Chunks alternate: literal (length, chars) and back-reference (length, offset); length 0 ends a chunk. @param {string} compressed */
function lzDecompress(compressed) {
  let plain = "";
  for (let index = 0, isLiteral = true; index < compressed.length; isLiteral = !isLiteral) {
    const length = Number(compressed[index++]);
    if (isLiteral) {
      plain += compressed.slice(index, index + length);
      index += length;
    } else if (length > 0) {
      const offset = Number(compressed[index++]);
      for (let copied = 0; copied < length; copied++) plain += plain[plain.length - offset];
    }
  }
  return plain;
}

// Shortest LZ encoding via dynamic programming over (offset, length) of the chunk in progress,
// following the game's own reference algorithm (ties broken deterministically).
/** @param {string} plain */
function lzCompress(plain) {
  /** @returns {(string | null)[][]} */
  const emptyStates = () => Array.from({ length: 10 }, () => Array(10).fill(null));
  let current = emptyStates();
  /** @param {(string | null)[][]} states @param {number} offset @param {number} length @param {string} encoded */
  const keepShorter = (states, offset, length, encoded) => {
    const existing = states[offset][length];
    if (existing === null || encoded.length < existing.length) states[offset][length] = encoded;
  };
  current[0][1] = "";
  for (let index = 1; index < plain.length; index++) {
    const next = emptyStates();
    const character = plain[index];
    for (let length = 1; length <= 9; length++) { // a literal chunk in progress
      const encoded = current[0][length];
      if (encoded === null) continue;
      if (length < 9) keepShorter(next, 0, length + 1, encoded);
      else keepShorter(next, 0, 1, encoded + "9" + plain.substring(index - 9, index) + "0");
      for (let offset = 1; offset <= Math.min(9, index); offset++) {
        if (plain[index - offset] === character) keepShorter(next, offset, 1, encoded + length + plain.substring(index - length, index));
      }
    }
    for (let offset = 1; offset <= 9; offset++) { // a back-reference chunk in progress
      for (let length = 1; length <= 9; length++) {
        const encoded = current[offset][length];
        if (encoded === null) continue;
        if (plain[index - offset] === character) {
          if (length < 9) keepShorter(next, offset, length + 1, encoded);
          else keepShorter(next, offset, 1, encoded + "9" + offset + "0");
        }
        keepShorter(next, 0, 1, encoded + length + offset);
        for (let newOffset = 1; newOffset <= Math.min(9, index); newOffset++) {
          if (plain[index - newOffset] === character) keepShorter(next, newOffset, 1, encoded + length + offset + "0");
        }
      }
    }
    current = next;
  }
  /** @type {string | null} */
  let best = null;
  for (let length = 1; length <= 9; length++) {
    const encoded = current[0][length];
    if (encoded === null) continue;
    const finished = encoded + length + plain.substring(plain.length - length);
    if (best === null || finished.length < best.length) best = finished;
  }
  for (let offset = 1; offset <= 9; offset++) {
    for (let length = 1; length <= 9; length++) {
      const encoded = current[offset][length];
      if (encoded === null) continue;
      const finished = encoded + length + offset;
      if (best === null || finished.length < best.length) best = finished;
    }
  }
  return best ?? "";
}

/** Shifts each letter `shift` places to the LEFT; spaces stay. @param {string} plaintext @param {number} shift */
function caesarEncrypt(plaintext, shift) {
  return [...plaintext].map((letter) => (letter === " " ? letter
    : String.fromCharCode(((letter.charCodeAt(0) - 65 - shift) % 26 + 26) % 26 + 65))).join("");
}

/** Standard Vigenère; the keyword repeats over every character position. @param {string} plaintext @param {string} keyword */
function vigenereEncrypt(plaintext, keyword) {
  return [...plaintext].map((letter, index) => (letter === " " ? letter
    : String.fromCharCode((letter.charCodeAt(0) - 65 + keyword.charCodeAt(index % keyword.length) - 65) % 26 + 65))).join("");
}

/** Square root of a big integer, rounded to the nearest integer (Newton's method on BigInt). @param {bigint | string | number} data */
function roundedSquareRoot(data) {
  const number = BigInt(data);
  if (number < 2n) return number;
  let root = BigInt(Math.floor(Math.sqrt(Number(number))));
  for (;;) { // Newton until stable, then fix to floor
    const next = (root + number / root) / 2n;
    if (next === root || next === root + 1n || next === root - 1n) { root = next; break; }
    root = next;
  }
  while (root * root > number) root--;
  while ((root + 1n) * (root + 1n) <= number) root++;
  return number - root * root <= (root + 1n) * (root + 1n) - number ? root : root + 1n;
}

/**
 * Largest rectangle without 1s, as its corners [[top, left], [bottom, right]].
 * Per row, heights[column] = zeros stacked above and including this cell, which turns each row into
 * "largest rectangle under a histogram". A stack of columns with increasing heights solves that in
 * O(columns): when a lower bar arrives, every taller bar on the stack can't extend further right, so it
 * is popped and its rectangle (from just after the bar below it on the stack to here) is measured.
 * @param {number[][]} matrix
 */
function largestZeroRectangle(matrix) {
  const columns = matrix[0].length;
  const heights = Array(columns).fill(0);
  let bestArea = 0;
  let best = [[0, 0], [0, 0]];
  matrix.forEach((row, rowIndex) => {
    row.forEach((cell, column) => { heights[column] = cell === 0 ? heights[column] + 1 : 0; });
    /** @type {number[]} column indices with increasing heights */
    const stack = [];
    for (let column = 0; column <= columns; column++) {
      const height = column < columns ? heights[column] : 0; // height-0 sentinel at the end flushes the stack
      while (stack.length > 0 && heights[stack[stack.length - 1]] >= height) {
        const barHeight = heights[/** @type {number} */ (stack.pop())];
        const left = stack.length > 0 ? stack[stack.length - 1] + 1 : 0;
        const right = column - 1;
        const area = barHeight * (right - left + 1);
        if (area > bestArea) {
          bestArea = area;
          best = [[rowIndex - barHeight + 1, left], [rowIndex, right]];
        }
      }
      stack.push(column);
    }
  });
  return best;
}

/** Primes in [low, high] with a segmented sieve. @param {number} low @param {number} high */
function countPrimes(low, high) {
  const start = Math.max(2, low);
  if (high < start) return 0;
  const limit = Math.floor(Math.sqrt(high));
  const smallIsPrime = Array(limit + 1).fill(true);
  /** @type {number[]} */
  const smallPrimes = [];
  for (let n = 2; n <= limit; n++) {
    if (!smallIsPrime[n]) continue;
    smallPrimes.push(n);
    for (let multiple = n * n; multiple <= limit; multiple += n) smallIsPrime[multiple] = false;
  }
  const isPrime = new Uint8Array(high - start + 1).fill(1);
  for (const prime of smallPrimes) {
    for (let multiple = Math.max(prime * prime, Math.ceil(start / prime) * prime); multiple <= high; multiple += prime) isPrime[multiple - start] = 0;
  }
  return isPrime.reduce((count, flag) => count + flag, 0);
}
