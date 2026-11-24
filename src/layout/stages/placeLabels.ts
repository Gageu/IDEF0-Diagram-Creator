import {
  bottom,
  contains,
  grow,
  intersects,
  segmentRect,
  type LeaderGeometry,
  type Point,
  type Rect,
  type TextGeometry,
} from '../../geometry/geometry';
import { verticalLabelLines, type LayoutDeps } from '../boundaryLabel';
import type { LabelAnchor, LayoutStage, LayoutState } from '../state';
import { textBounds } from '../textBounds';
import { wrapText } from '../wrapText';

/** One way to set a label: its text blocks, and how far it is from ideal. */
interface Candidate {
  readonly texts: readonly TextGeometry[];
  readonly cost: number;
}

interface Segment {
  readonly a: Point;
  readonly b: Point;
  /** Length at the end taken up by an arrowhead. */
  readonly headRoom: number;
}

/**
 * Stage 7: sets every label beside its arrow where nothing else is drawn.
 *
 * Each label gets a list of candidate positions, cheapest first: a boundary
 * label beside its arrow at the frame edge, at a few heights and on either
 * side; any other label above, below or beside each segment of its arrow,
 * nearest its anchor first. The first candidate that touches no box, arrow
 * or earlier label wins. A label with no free candidate goes to the nearest
 * free space with a leader line to its arrow (rule B10).
 */
export function createPlaceLabelsStage(deps: LayoutDeps): LayoutStage {
  const { codeOffset, codeWidth, lineGap, wrapWidth } = deps.options.label;
  const style = deps.theme.text.arrowLabel;
  const width = (line: string): number => deps.measurer.width(line, style);
  const ascent = style.fontSize * 0.78;
  /** Space kept clear around a label. */
  const pad = 3;

  const arrowText = (x: number, y: number, lines: readonly string[], anchor: TextGeometry['anchor']): TextGeometry => ({ x, y, lines, style: 'arrowLabel', anchor });
  const withoutEmpty = (texts: readonly TextGeometry[]): TextGeometry[] => texts.filter((t) => t.lines.some((line) => line !== ''));
  const codeText = (x: number, y: number, code: string, anchor: TextGeometry['anchor']): TextGeometry => ({ x, y, lines: [code], style: 'icomCode', anchor });

  /** A label at the frame edge with its ICOM code: beside the arrow, staggered away from the edge if needed. */
  function edgeCandidates(a: LabelAnchor, state: LayoutState): Candidate[] {
    const { frame } = state;
    const { x, y } = a.point;
    const candidates: Candidate[] = [];
    const step = style.lineHeight + 2;

    if (a.edge === 'left' || a.edge === 'right') {
      // Above the line first, below it second.
      [y - lineGap, y + lineGap + ascent].forEach((baseline, i) => {
        const texts =
          a.edge === 'left'
            ? [...(a.code ? [codeText(x + codeOffset, baseline, a.code, 'start')] : []), arrowText(x + codeOffset + (a.code ? codeWidth : 0), baseline, [a.text], 'start')]
            : [...(a.code ? [codeText(x - codeOffset, baseline, a.code, 'end')] : []), arrowText(x - codeOffset - (a.code ? codeWidth + 4 : 0), baseline, [a.text], 'end')];
        candidates.push({ texts, cost: i * 10 });
      });
      return candidates;
    }

    const wrapped = verticalLabelLines(a.text, deps);
    const lineSets = wrapped.length > 1 ? [wrapped, [a.text]] : [wrapped];
    for (let k = 0; k < 8; k++) {
      const baseline = a.edge === 'top' ? frame.y + 30 + k * step : bottom(frame) - 60 - k * step + (k === 7 ? 9 * step : 0);
      lineSets.forEach((lines, variant) => {
        // Right of the arrow: code, then label. Left of it: code above the label, both ending at the arrow.
        candidates.push({
          cost: k * 4 + variant * 2,
          texts: [...(a.code ? [codeText(x + codeOffset, baseline, a.code, 'start')] : []), arrowText(x + codeOffset + (a.code ? codeWidth : 0), baseline, lines, 'start')],
        });
        candidates.push({
          cost: k * 4 + variant * 2 + 3,
          texts: [...(a.code ? [codeText(x - codeOffset, baseline, a.code, 'end')] : []), arrowText(x - codeOffset, baseline + (a.code ? style.lineHeight : 0), lines, 'end')],
        });
      });
    }
    return candidates;
  }

  /** A label inside the diagram: above, below or beside any segment of its own arrow, nearest its anchor first. */
  function segmentCandidates(a: LabelAnchor, segments: readonly Segment[]): Candidate[] {
    const wrapped = wrapText(a.text, wrapWidth, width);
    const lineSets = wrapped.length > 1 ? [[a.text], wrapped] : [[a.text]];
    const candidates: Candidate[] = [];

    for (const { a: p, b: q, headRoom } of segments) {
      const horizontal = p.y === q.y;
      const [lo, hi] = horizontal ? [Math.min(p.x, q.x), Math.max(p.x, q.x)] : [Math.min(p.y, q.y), Math.max(p.y, q.y)];
      // Keep clear of the arrowhead, which sits at whichever end `q` is.
      const usable: [number, number] = (horizontal ? q.x > p.x : q.y > p.y) ? [lo, hi - headRoom] : [lo + headRoom, hi];
      const positions: number[] = [];
      for (let t = usable[0] + 8; t <= usable[1] - 8; t += 12) positions.push(t);
      if (positions.length === 0) positions.push((usable[0] + usable[1]) / 2);

      for (const t of positions) {
        const attach = horizontal ? { x: t, y: p.y } : { x: p.x, y: t };
        const distance = Math.abs(attach.x - a.point.x) + Math.abs(attach.y - a.point.y);
        lineSets.forEach((lines, variant) => {
          const blockWidth = Math.max(...lines.map(width));
          const blockHeight = (lines.length - 1) * style.lineHeight;
          const overhang = (from: number, to: number): number => Math.max(0, usable[0] - from) + Math.max(0, to - usable[1]);
          if (horizontal) {
            const above = p.y - lineGap - blockHeight;
            const below = p.y + lineGap + ascent;
            for (const [anchor, from, extra] of [['start', t, 0], ['middle', t - blockWidth / 2, 1], ['end', t - blockWidth, 2]] as const) {
              const cost = distance + overhang(from, from + blockWidth) * 0.5 + variant * 6 + extra;
              candidates.push({ cost, texts: [arrowText(Math.round(t), above, lines, anchor)] });
              candidates.push({ cost: cost + 12, texts: [arrowText(Math.round(t), below, lines, anchor)] });
            }
          } else {
            const baseline = Math.round(t - blockHeight / 2 + ascent / 2);
            const cost = distance + overhang(baseline - ascent, baseline + blockHeight) * 0.5 + variant * 2;
            candidates.push({ cost, texts: [arrowText(p.x + lineGap, baseline, lines, 'start')] });
            candidates.push({ cost: cost + 4, texts: [arrowText(p.x - lineGap, baseline, lines, 'end')] });
          }
        });
      }
    }
    return candidates.sort((c1, c2) => c1.cost - c2.cost);
  }

  return {
    name: 'place-labels',
    run(state) {
      const blocked: Rect[] = [
        ...state.boxes.map((b) => grow(b.rect, pad)),
        ...state.routes.flatMap((r) => r.points.slice(1).map((p, i) => segmentRect(r.points[i]!, p, pad))),
        ...state.texts.map((t) => grow(textBounds(t, deps), pad)),
        ...state.tunnels.map((t) => {
          const { near, far, halfHeight } = deps.theme.tunnel;
          const [a, b] = [near - 4, far + 4].map((d) => ({ x: t.at.x + t.inward.x * d, y: t.at.y + t.inward.y * d }));
          return segmentRect(a!, b!, halfHeight + pad);
        }),
      ];
      const inside = grow(state.frame, -pad);
      const isFree = (rects: readonly Rect[]): boolean => rects.every((r) => contains(inside, r) && !blocked.some((b) => intersects(r, b)));
      const bounds = (texts: readonly TextGeometry[]): Rect[] => texts.map((t) => textBounds(t, deps));

      const segmentsOf = (arrowId: string): Segment[] =>
        state.routes
          .filter((r) => r.arrowId === arrowId)
          .flatMap((r) => r.points.slice(1).map((p, i) => ({ a: r.points[i]!, b: p, headRoom: r.head && i === r.points.length - 2 ? deps.theme.arrow.headLength + 2 : 0 })));

      const texts: TextGeometry[] = [];
      const leaders: LeaderGeometry[] = [];
      const place = (placed: readonly TextGeometry[], arrowId: string): void => {
        texts.push(...placed.map((t) => ({ ...t, arrowId })));
        blocked.push(...bounds(placed).map((r) => grow(r, pad)));
      };

      // Labels at the frame have the least freedom, so they choose first.
      const ordered = [...state.anchors.filter((a) => a.edge !== 'none'), ...state.anchors.filter((a) => a.edge === 'none')];
      for (const anchor of ordered) {
        if (anchor.text === '' && anchor.code === undefined) continue;
        const candidates = anchor.edge === 'none' ? segmentCandidates(anchor, segmentsOf(anchor.arrowId)) : edgeCandidates(anchor, state);
        if (candidates.length === 0) continue;
        const fit = candidates.find((c) => isFree(bounds(c.texts)));
        if (fit) {
          place(fit.texts, anchor.arrowId);
          continue;
        }
        // An ICOM code is short and stays at the frame even when its label has to move away.
        const codeOnly = anchor.code === undefined ? undefined : edgeCandidates({ ...anchor, text: '' }, state).map((c) => ({ ...c, texts: withoutEmpty(c.texts) })).find((c) => isFree(bounds(c.texts)));
        const led = withLeader(anchor);
        if (led && (anchor.code === undefined || codeOnly)) {
          place([...(codeOnly?.texts ?? []), ...led.texts], anchor.arrowId);
          leaders.push(led.leader);
        } else if (candidates[0]) {
          place(candidates[0].texts, anchor.arrowId); // Nowhere is free; the check stage reports it.
        }
      }
      return { ...state, texts: [...state.texts, ...texts], leaders: [...state.leaders, ...leaders] };

      /**
       * A free spot close to the arrow, tied to it by a leader line that
       * crosses no box. Spots near the anchor end of the arrow are tried first.
       */
      function withLeader(anchor: LabelAnchor): { texts: TextGeometry[]; leader: LeaderGeometry } | undefined {
        const lines = wrapText(anchor.text, wrapWidth, width);
        const blockWidth = Math.max(...lines.map(width));
        const blockHeight = (lines.length - 1) * style.lineHeight + style.fontSize;
        const distance = (p: Point): number => Math.abs(p.x - anchor.point.x) + Math.abs(p.y - anchor.point.y);
        const middles = segmentsOf(anchor.arrowId).map((s) => ({ x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 }));
        const targets = (middles.length > 0 ? middles : [anchor.point]).sort((p, q) => distance(p) - distance(q));
        for (let radius = 30; radius <= 150; radius += 15) {
          for (const to of targets) {
            for (const [dx, dy] of [[1, -1], [1, 1], [-1, 1], [-1, -1], [0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
              const text = arrowText(Math.round(to.x + dx * radius - blockWidth / 2), Math.round(to.y + dy * radius - blockHeight / 2 + ascent), lines, 'start');
              const rect = textBounds(text, deps);
              if (!isFree([rect])) continue;
              // The leader starts on the label edge nearest the arrow.
              const from = { x: Math.max(rect.x, Math.min(to.x, rect.x + rect.width)), y: Math.max(rect.y, Math.min(to.y, rect.y + rect.height)) };
              const along = Array.from({ length: 9 }, (_, i) => ({ x: from.x + ((to.x - from.x) * (i + 1)) / 10, y: from.y + ((to.y - from.y) * (i + 1)) / 10 }));
              const crossesBox = along.some((p) => state.boxes.some((b) => contains(b.rect, { ...p, width: 0, height: 0 })));
              if (!crossesBox) return { texts: [text], leader: { from, to } };
            }
          }
        }
        return undefined;
      }
    },
  };
}
