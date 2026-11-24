/**
 * Runs one exporter for the editor: supplies the drawing, holds back diagrams
 * that have rule errors, and collects what the user should be told. Plain
 * logic, so it is tested without a browser.
 */
import { diagramNode, type DiagramId, type Model } from '../../domain';
import type { Exporter, ExportFile } from '../../export';
import type { DiagramGeometry } from '../../geometry/geometry';
import type { Violation } from '../../validation';

export interface ExportInput {
  readonly model: Model;
  readonly diagramId: DiagramId;
  readonly violations: readonly Violation[];
  layout(model: Model, diagramId: DiagramId): DiagramGeometry;
  render(geometry: DiagramGeometry): string;
}

export interface ExportOutcome {
  readonly files: readonly ExportFile[];
  /** Diagrams left out, and diagrams exported with layout warnings. */
  readonly notes: readonly string[];
}

export function runExport(exporter: Exporter, input: ExportInput): ExportOutcome {
  const { model, violations } = input;
  const layoutNotes: string[] = [];
  const result = exporter.export({
    model,
    diagramId: input.diagramId,
    drawSvg: (diagramId) => {
      const geometry = input.layout(model, diagramId);
      // A drawing the layout could not get clean is still exported, but never silently.
      if (geometry.defects.length > 0) layoutNotes.push(`${diagramNode(model, diagramId)} was exported with ${geometry.defects.length} layout ${geometry.defects.length === 1 ? 'warning' : 'warnings'}`);
      return input.render(geometry);
    },
    blockedReason: (diagramId) => {
      const errors = violations.filter((v) => v.severity === 'error' && v.diagramId === diagramId).length;
      return errors === 0 ? undefined : `it has ${errors} rule ${errors === 1 ? 'error' : 'errors'} (see Violations)`;
    },
  });
  return { files: result.files, notes: [...result.skipped, ...layoutNotes] };
}
