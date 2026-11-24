import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONTEXT_DIAGRAM, defineTerm, renameFunction, type DiagramId } from '../src/domain';
import { allDiagramsSvg, crc32, currentDiagramSvg, exporters, glossaryMarkdown, icomTableMarkdown, markdownCell, safeFileName, zipFiles, type ExportContext } from '../src/export';
import { referenceModel } from './fixtures';

function context(overrides: Partial<ExportContext> = {}): ExportContext {
  return {
    model: referenceModel(),
    diagramId: 'A2',
    drawSvg: (id: DiagramId) => `<svg data-diagram="${id}"/>`,
    blockedReason: () => undefined,
    ...overrides,
  };
}

describe('SVG export', () => {
  it('exports the open diagram as one file named after its node', () => {
    const result = currentDiagramSvg.export(context());
    expect(result).toEqual({ files: [{ name: 'A2.svg', mimeType: 'image/svg+xml', content: '<svg data-diagram="A2"/>' }], skipped: [] });
  });

  it('exports every diagram in tree order', () => {
    const result = allDiagramsSvg.export(context());
    expect(result.files.map((f) => f.name)).toEqual(['A-0.svg', 'A0.svg', 'A2.svg', 'A4.svg']);
    expect(result.files[0]!.content).toBe(`<svg data-diagram="${CONTEXT_DIAGRAM}"/>`);
  });

  it('leaves out a diagram with a rule error and says why', () => {
    const result = allDiagramsSvg.export(context({ blockedReason: (id) => (id === 'A4' ? 'it has 2 rule errors' : undefined) }));
    expect(result.files.map((f) => f.name)).toEqual(['A-0.svg', 'A0.svg', 'A2.svg']);
    expect(result.skipped).toEqual(['A4 was not exported: it has 2 rule errors']);
  });
});

describe('glossary export', () => {
  it('lists used terms alphabetically with their definitions and counts the undefined ones', () => {
    const model = [defineTerm({ term: 'Host', definition: 'Leads the interview | on air' }), defineTerm({ term: 'Gone term', definition: 'unused' })].reduce((m, c) => c.apply(m), referenceModel());
    const result = glossaryMarkdown.export(context({ model }));
    const file = result.files[0]!;
    expect(file.name).toBe('Podcast-Episode-Production-glossary.md');
    expect(file.content).toContain('| Host | Leads the interview \\| on air |');
    expect(file.content).not.toContain('Gone term');
    const terms = file.content.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| Term') && !l.startsWith('| ---')).map((l) => l.split(' | ')[0]!.slice(2));
    expect(terms).toEqual([...terms].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })));
    expect(result.skipped[0]).toMatch(/^\d+ terms have no definition yet$/);
  });
});

describe('ICOM table export', () => {
  it('has one table per diagram with each function\'s arrows by role', () => {
    const content = icomTableMarkdown.export(context()).files[0]!.content;
    expect(content.match(/^## /gm)).toHaveLength(4);
    expect(content).toContain('## A0 Produce Podcast Episode');
    expect(content).toContain('| A1 Plan Episode | Episode idea; Guest availability | Editorial calendar; Listener feedback | Recording schedule; Episode outline | Producer |');
  });

  it('follows the model', () => {
    const model = renameFunction({ id: 'A1', label: 'Log Request' }).apply(referenceModel());
    expect(icomTableMarkdown.export(context({ model })).files[0]!.content).toContain('| A1 Log Request |');
  });
});

describe('export helpers', () => {
  it('make safe file names and one-line table cells', () => {
    expect(safeFileName(' A/B: C? ')).toBe('A-B-C');
    expect(safeFileName('   ')).toBe('untitled');
    expect(markdownCell('a |\n b')).toBe('a \\| b');
  });

  it('every exporter has a unique id and a label', () => {
    expect(new Set(exporters.map((e) => e.id)).size).toBe(exporters.length);
    expect(exporters.every((e) => e.label.length > 0)).toBe(true);
  });
});

describe('zip', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('writes an archive that a standard unzipper reads back', () => {
    const entries = [
      { name: 'A-0.svg', content: '<svg>context</svg>' },
      { name: 'notes/ünïcode.md', content: '# Größe\n' },
    ];
    const dir = mkdtempSync(join(tmpdir(), 'idef0-zip-'));
    const path = join(dir, 'out.zip');
    writeFileSync(path, zipFiles(entries));
    const script = 'import sys, zipfile, json\nz = zipfile.ZipFile(sys.argv[1])\nassert z.testzip() is None\nprint(json.dumps({n: z.read(n).decode("utf-8") for n in z.namelist()}))';
    const read = JSON.parse(execFileSync('python3', ['-c', script, path], { encoding: 'utf8' })) as Record<string, string>;
    expect(read).toEqual(Object.fromEntries(entries.map((e) => [e.name, e.content])));
    expect(readFileSync(path).subarray(0, 4).toString('latin1')).toBe('PK\u0003\u0004');
  });

  it('is deterministic', () => {
    const entries = [{ name: 'a.txt', content: 'a' }];
    expect(zipFiles(entries)).toEqual(zipFiles(entries));
  });
});
