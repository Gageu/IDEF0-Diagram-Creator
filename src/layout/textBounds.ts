import type { Rect, TextGeometry } from '../geometry/geometry';
import type { LayoutDeps } from './boundaryLabel';

/** Share of the font size that glyphs rise above and fall below the baseline. */
const ASCENT = 0.78;
const DESCENT = 0.22;

/** The rectangle a block of text covers, from its anchor, style and measured line widths. */
export function textBounds(text: TextGeometry, deps: Pick<LayoutDeps, 'theme' | 'measurer'>): Rect {
  const style = deps.theme.text[text.style];
  const width = Math.max(0, ...text.lines.map((line) => deps.measurer.width(line, style)));
  const x = text.anchor === 'start' ? text.x : text.anchor === 'end' ? text.x - width : text.x - width / 2;
  return {
    x,
    y: text.y - style.fontSize * ASCENT,
    width,
    height: style.fontSize * (ASCENT + DESCENT) + (text.lines.length - 1) * style.lineHeight,
  };
}
