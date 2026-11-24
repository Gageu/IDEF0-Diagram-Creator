import type { Theme } from '../theme/theme';
import type { LayoutOptions } from './options';
import type { TextMeasurer } from './textMeasurer';
import { wrapText } from './wrapText';

export interface LayoutDeps {
  readonly options: LayoutOptions;
  readonly theme: Theme;
  readonly measurer: TextMeasurer;
}

/** The lines of a label that sits beside a vertical boundary arrow. */
export function verticalLabelLines(label: string, deps: LayoutDeps): string[] {
  const style = deps.theme.text.arrowLabel;
  return wrapText(label, deps.options.label.wrapWidth, (line) => deps.measurer.width(line, style));
}

export function widestLine(lines: readonly string[], deps: LayoutDeps): number {
  const style = deps.theme.text.arrowLabel;
  return Math.max(0, ...lines.map((line) => deps.measurer.width(line, style)));
}

/** Width a boundary arrow's ICOM code and label take up beside its line. */
export function boundaryLabelExtent(labelWidth: number, options: LayoutOptions): number {
  const { codeOffset, codeWidth, clearance } = options.label;
  return codeOffset + codeWidth + labelWidth + clearance;
}
