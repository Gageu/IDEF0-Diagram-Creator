/**
 * The contract every export format implements. An exporter turns the model
 * into one or more files and knows nothing about the screen, the browser or
 * how a diagram is drawn: drawing is handed to it as a function. Adding a
 * format is one new file and one line in the registry.
 */
import type { DiagramId, Model } from '../domain';

export interface ExportFile {
  readonly name: string;
  readonly mimeType: string;
  readonly content: string;
}

export interface ExportContext {
  readonly model: Model;
  /** The diagram open on screen, for exporters that work on one diagram. */
  readonly diagramId: DiagramId;
  /** The finished SVG of one diagram, exactly as shown on screen. */
  drawSvg(diagramId: DiagramId): string;
  /** Why a diagram may not be exported (it has a rule error), or undefined when it may. */
  blockedReason(diagramId: DiagramId): string | undefined;
}

export interface ExportResult {
  readonly files: readonly ExportFile[];
  /** What was left out and why, in words for the user. */
  readonly skipped: readonly string[];
}

export interface Exporter {
  readonly id: string;
  /** Text for the export menu. */
  readonly label: string;
  export(context: ExportContext): ExportResult;
}

/** Characters that are unsafe in a file name on some system become hyphens. */
export function safeFileName(name: string): string {
  return name.trim().replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '') || 'untitled';
}

/** A cell of a Markdown table: one line, with the column separator escaped. */
export function markdownCell(text: string): string {
  return text.replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|').trim();
}
