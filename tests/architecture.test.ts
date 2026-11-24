import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The module dependency table from section 4 of the design spec. A module may
 * import only from itself and the modules listed for it; `app` is the shell
 * that wires everything together.
 */
const ALLOWED: Record<string, readonly string[]> = {
  domain: [],
  theme: [],
  geometry: ['theme'],
  persistence: ['domain'],
  layout: ['domain', 'geometry', 'theme'],
  render: ['geometry', 'theme'],
  app: ['domain', 'geometry', 'layout', 'persistence', 'render', 'theme'],
};

const src = fileURLToPath(new URL('../src', import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('module boundaries', () => {
  const files = sourceFiles(src);

  it('every source folder is a known module', () => {
    expect([...new Set(files.map((f) => relative(src, f).split('/')[0]!))].sort()).toEqual(Object.keys(ALLOWED).sort());
  });

  it('dependencies point one way, as the design spec lays out', () => {
    const violations: string[] = [];
    for (const file of files) {
      const module = relative(src, file).split('/')[0]!;
      for (const match of readFileSync(file, 'utf8').matchAll(/from\s+'(\.[^']*)'/g)) {
        const target = relative(src, resolve(dirname(file), match[1]!)).split('/')[0]!;
        const outsideSrc = target === '..'; // Bundled example data, not a module.
        if (!outsideSrc && target !== module && !ALLOWED[module]!.includes(target)) {
          violations.push(`${relative(src, file)} imports from ${target}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('names the routing library only inside its adapter', () => {
    const users = files.filter((f) => /from\s+'libavoid-js'/.test(readFileSync(f, 'utf8'))).map((f) => relative(src, f));
    expect(users).toEqual(['layout/routers/libavoidRouter.ts']);
  });

  it('only the app shell uses React', () => {
    const offenders = files.filter((f) => !relative(src, f).startsWith('app/') && /from\s+'react/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
