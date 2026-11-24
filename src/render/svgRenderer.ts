/**
 * Turns diagram geometry into an SVG string. A port of the reference pack's
 * `idef0.py`: square boxes, orthogonal arrows with arc bends, arrowheads as
 * separate filled triangles, a frame and the NODE / TITLE / NUMBER footer.
 * The on-screen preview and the exported file are this same string.
 */
import {
  bottom,
  right,
  type ArrowGeometry,
  type BoxGeometry,
  type DiagramGeometry,
  type LeaderGeometry,
  type Point,
  type TextAnchor,
} from '../geometry/geometry';
import type { TextStyleName, Theme } from '../theme/theme';

export function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Trims float noise so the output is stable and compact. */
function n(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function text(theme: Theme, x: number, y: number, content: string, styleName: TextStyleName, anchor: TextAnchor): string {
  const style = theme.text[styleName];
  return (
    `<text x="${n(x)}" y="${n(y)}" font-family="${escapeXml(theme.fontFamily)}" font-size="${style.fontSize}" ` +
    `text-anchor="${anchor}" font-weight="${style.bold ? 'bold' : 'normal'}" fill="${theme.ink}">${escapeXml(content)}</text>`
  );
}

function lines(theme: Theme, x: number, y: number, content: readonly string[], styleName: TextStyleName, anchor: TextAnchor): string {
  const lineHeight = theme.text[styleName].lineHeight;
  return content.map((line, i) => text(theme, x, y + i * lineHeight, line, styleName, anchor)).join('');
}

function box(theme: Theme, b: BoxGeometry): string {
  const { rect } = b;
  const style = theme.text.boxLabel;
  // Vertically centre the block of label lines on the box, as the reference does.
  const firstBaseline = rect.y + rect.height / 2 - ((b.labelLines.length - 1) * style.lineHeight) / 2 + 5;
  const inset = theme.box.numberInset;
  return (
    `<rect x="${n(rect.x)}" y="${n(rect.y)}" width="${n(rect.width)}" height="${n(rect.height)}" ` +
    `fill="${theme.paper}" stroke="${theme.ink}" stroke-width="${theme.box.strokeWidth}"/>` +
    lines(theme, rect.x + rect.width / 2, firstBaseline, b.labelLines, 'boxLabel', 'middle') +
    text(theme, right(rect) - inset, bottom(rect) - inset, b.number, 'boxNumber', 'end')
  );
}

function direction(from: Point, to: Point): Point {
  return { x: Math.sign(to.x - from.x), y: Math.sign(to.y - from.y) };
}

function distance(a: Point, b: Point): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function arrow(theme: Theme, a: ArrowGeometry): string {
  const points = a.points.filter((p, i) => i === 0 || distance(p, a.points[i - 1]!) > 0);
  if (points.length < 2) return '';
  const { bendRadius, headLength, headHalfWidth, strokeWidth } = theme.arrow;

  let d = `M${n(points[0]!.x)},${n(points[0]!.y)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [before, corner, after] = [points[i - 1]!, points[i]!, points[i + 1]!];
    const d1 = direction(before, corner);
    const d2 = direction(corner, after);
    if ((d1.x !== 0 && d1.y !== 0) || (d2.x !== 0 && d2.y !== 0)) {
      throw new Error(`Arrow ${a.arrowId} has a diagonal segment`);
    }
    const turn = d1.x * d2.y - d1.y * d2.x;
    if (turn === 0) continue; // Collinear point: nothing to bend.
    // A bend never takes more than half of either segment it joins.
    const r = Math.min(bendRadius, distance(before, corner) / 2, distance(corner, after) / 2);
    d += ` L${n(corner.x - d1.x * r)},${n(corner.y - d1.y * r)}`;
    d += ` A${n(r)},${n(r)} 0 0 ${turn > 0 ? 1 : 0} ${n(corner.x + d2.x * r)},${n(corner.y + d2.y * r)}`;
  }

  const end = points[points.length - 1]!;
  const dir = direction(points[points.length - 2]!, end);
  // The line stops at the arrowhead's base so editors show one clean triangle.
  const base = a.head ? { x: end.x - dir.x * headLength, y: end.y - dir.y * headLength } : end;
  d += ` L${n(base.x)},${n(base.y)}`;
  let svg = `<path d="${d}" fill="none" stroke="${theme.ink}" stroke-width="${strokeWidth}"/>`;
  if (a.head) {
    const p1 = { x: base.x - dir.y * headHalfWidth, y: base.y + dir.x * headHalfWidth };
    const p2 = { x: base.x + dir.y * headHalfWidth, y: base.y - dir.x * headHalfWidth };
    svg += `<polygon points="${n(end.x)},${n(end.y)} ${n(p1.x)},${n(p1.y)} ${n(p2.x)},${n(p2.y)}" fill="${theme.ink}"/>`;
  }
  return svg;
}

/** A leader is the IDEF0 squiggle: a thin line with one zigzag, from a label to its arrow. */
function leader(theme: Theme, l: LeaderGeometry): string {
  const [dx, dy] = [l.to.x - l.from.x, l.to.y - l.from.y];
  const length = Math.hypot(dx, dy) || 1;
  const [nx, ny] = [(-dy / length) * 4, (dx / length) * 4];
  const at = (t: number, side: number): string => `${n(l.from.x + dx * t + nx * side)},${n(l.from.y + dy * t + ny * side)}`;
  return `<path d="M${at(0, 0)} L${at(0.4, 1)} L${at(0.6, -1)} L${at(1, 0)}" fill="none" stroke="${theme.ink}" stroke-width="${theme.leader.strokeWidth}"/>`;
}

function footer(theme: Theme, g: DiagramGeometry): string {
  const f = theme.footer;
  const top = bottom(g.frame);
  const nodeEnd = g.frame.x + f.nodeCellWidth;
  const numberStart = right(g.frame) - f.numberCellWidth;
  const divider = (x: number): string =>
    `<line x1="${n(x)}" y1="${n(top)}" x2="${n(x)}" y2="${n(top + f.height)}" stroke="${theme.ink}"/>`;
  const cell = (x: number, caption: string, value: string): string =>
    text(theme, x + f.textInset, top + f.captionBaseline, caption, 'footerCaption', 'start') +
    text(theme, x + f.textInset, top + f.valueBaseline, value, 'footerValue', 'start');
  return (
    `<rect x="${n(g.frame.x)}" y="${n(top)}" width="${n(g.frame.width)}" height="${f.height}" fill="${theme.paper}" stroke="${theme.ink}"/>` +
    divider(nodeEnd) +
    divider(numberStart) +
    cell(g.frame.x, 'NODE:', g.footer.node) +
    cell(nodeEnd, 'TITLE:', g.footer.title) +
    cell(numberStart, 'NUMBER:', g.footer.number)
  );
}

export function renderSvg(geometry: DiagramGeometry, theme: Theme): string {
  const { size, frame } = geometry;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(size.width)}" height="${n(size.height)}" viewBox="0 0 ${n(size.width)} ${n(size.height)}">` +
    `<rect width="${n(size.width)}" height="${n(size.height)}" fill="${theme.paper}"/>` +
    `<rect x="${n(frame.x)}" y="${n(frame.y)}" width="${n(frame.width)}" height="${n(frame.height)}" fill="none" stroke="${theme.ink}" stroke-width="${theme.frame.strokeWidth}"/>` +
    geometry.boxes.map((b) => box(theme, b)).join('') +
    geometry.arrows.map((a) => arrow(theme, a)).join('') +
    geometry.leaders.map((l) => leader(theme, l)).join('') +
    geometry.texts.map((t) => lines(theme, t.x, t.y, t.lines, t.style, t.anchor)).join('') +
    footer(theme, geometry) +
    '</svg>'
  );
}
