import { describe, expect, it } from 'vitest';
import { checkModel, createLayoutDiagram, loadRouter, renderExportSvg } from '../src/app/composition';
import { runExport } from '../src/app/editor/exporting';
import { CONTEXT_DIAGRAM, deleteArrow, arrowsOn } from '../src/domain';
import { allDiagramsSvg, currentDiagramSvg, exporters, glossaryMarkdown } from '../src/export';
import { referenceModel } from './fixtures';

const layout = createLayoutDiagram(await loadRouter());
const input = (model = referenceModel(), diagramId: string = CONTEXT_DIAGRAM) => ({ model, diagramId, violations: checkModel(model), layout, render: renderExportSvg });

describe('exporting from the editor', () => {
  it('exports all four reference diagrams as the SVG the screen shows, minus click targets', () => {
    const outcome = runExport(allDiagramsSvg, input());
    expect(outcome.files.map((f) => f.name)).toEqual(['A-0.svg', 'A0.svg', 'A2.svg', 'A4.svg']);
    expect(outcome.notes).toEqual([]);
    for (const file of outcome.files) {
      expect(file.content.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
      expect(file.content).not.toContain('data-');
    }
    expect(outcome.files[1]!.content).toBe(renderExportSvg(layout(referenceModel(), 'A0')));
  });

  it('holds back a diagram with a rule error and exports the rest', () => {
    const model = referenceModel();
    const broken = deleteArrow({ id: arrowsOn(model, 'A2').find((a) => a.sources.some((s) => s.kind === 'boundary'))!.id }).apply(model);
    const all = runExport(allDiagramsSvg, input(broken));
    expect(all.files.map((f) => f.name)).toEqual(['A-0.svg', 'A0.svg', 'A4.svg']);
    expect(all.notes).toHaveLength(1);
    expect(all.notes[0]).toMatch(/^A2 was not exported: it has \d+ rule errors? \(see Violations\)$/);
    expect(runExport(currentDiagramSvg, input(broken, 'A2')).files).toEqual([]);
  });

  it('warnings do not block export, and model-only exporters never lay anything out', () => {
    const outcome = runExport(glossaryMarkdown, { ...input(), layout: () => { throw new Error('not needed'); } });
    expect(outcome.files).toHaveLength(1);
  });

  it('every registered exporter produces at least one file for the reference model', () => {
    for (const exporter of exporters) expect(runExport(exporter, input()).files.length).toBeGreaterThan(0);
  });
});
