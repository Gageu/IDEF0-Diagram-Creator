/**
 * Breaks text into the fewest lines that fit `maxWidth`, then balances them:
 * of all breakings with that many lines it picks the one whose longest line
 * is shortest. "Manage Requirement Change Requests" becomes two even lines
 * instead of three words and an orphan.
 */
export function wrapText(text: string, maxWidth: number, measure: (line: string) => number): string[] {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return [];

  let lineCount = 1;
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && measure(candidate) > maxWidth) {
      lineCount += 1;
      current = word;
    } else {
      current = candidate;
    }
  }

  // best[i][k]: the best way to set words[i..] in k lines, as [widest line, lines].
  const memo = new Map<string, readonly [number, string[]]>();
  const best = (start: number, linesLeft: number): readonly [number, string[]] => {
    const key = `${start}/${linesLeft}`;
    const cached = memo.get(key);
    if (cached) return cached;
    let result: readonly [number, string[]] = [Infinity, []];
    if (linesLeft === 1) {
      const line = words.slice(start).join(' ');
      result = [measure(line), [line]];
    } else {
      for (let end = start + 1; end <= words.length - (linesLeft - 1); end++) {
        const line = words.slice(start, end).join(' ');
        const [restWidth, restLines] = best(end, linesLeft - 1);
        const widest = Math.max(measure(line), restWidth);
        if (widest < result[0]) result = [widest, [line, ...restLines]];
      }
    }
    memo.set(key, result);
    return result;
  };
  return best(0, Math.min(lineCount, words.length))[1];
}
