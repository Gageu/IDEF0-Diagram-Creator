import { bottom, right, type Point } from '../../geometry/geometry';
import { boundaryLabelExtent, verticalLabelLines, widestLine, type LayoutDeps } from '../boundaryLabel';
import type { Connection, Heading, LayoutStage, LayoutState, PlacedBox, Port } from '../state';
import type { Side, ViewArrow, ViewEnd } from '../view';

const ENTRY_HEADING: Record<Exclude<Side, 'right'>, Heading> = { left: 'east', top: 'south', bottom: 'north' };

/**
 * Stage 3: gives every arrow end a fixed point. Arrows share a box side
 * evenly in model order; a boundary arrow crosses the frame straight in line
 * with its box slot. Ordering slots to reduce crossings is a later milestone.
 */
export function createAssignSlotsStage(deps: LayoutDeps): LayoutStage {
  const { options } = deps;

  return {
    name: 'assign-slots',
    run(state) {
      const { view, frame } = state;
      const boxById = new Map(state.boxes.map((b) => [b.id, b]));

      /** The point where an arrow meets a box side: the side is shared evenly by its arrows. */
      const slot = (box: PlacedBox, side: Side, arrow: ViewArrow): Point => {
        const attaches = (end: ViewEnd): boolean => end.kind === 'box' && end.boxId === box.id && end.side === side;
        const onSide = view.arrows.filter((a) => (side === 'right' ? a.sources : a.targets).some(attaches));
        const fraction = (onSide.indexOf(arrow) + 1) / (onSide.length + 1);
        const { rect } = box;
        switch (side) {
          case 'left':
            return { x: rect.x, y: Math.round(rect.y + rect.height * fraction) };
          case 'right':
            return { x: right(rect), y: Math.round(rect.y + rect.height * fraction) };
          case 'top':
            return { x: Math.round(rect.x + rect.width * fraction), y: rect.y };
          case 'bottom':
            return { x: Math.round(rect.x + rect.width * fraction), y: bottom(rect) };
        }
      };

      /** Where a boundary arrow crosses the frame on its way to a box slot. */
      const frameEntry = (edge: Side, toSide: Side, toBox: PlacedBox, to: Point): Port => {
        const beside = options.routing.loopClearance;
        if (edge === 'left') {
          // Not in line with a top or bottom slot: come in just above or below the box.
          const y = toSide === 'left' ? to.y : toSide === 'top' ? toBox.rect.y - beside : bottom(toBox.rect) + beside;
          return { point: { x: frame.x, y }, heading: 'east' };
        }
        const x = toSide === edge ? to.x : toBox.rect.x - beside;
        return edge === 'top'
          ? { point: { x, y: frame.y }, heading: 'south' }
          : { point: { x, y: bottom(frame) }, heading: 'north' };
      };

      const connections: Connection[] = [];
      for (const arrow of view.arrows) {
        for (const source of arrow.sources) {
          for (const target of arrow.targets) {
            const base = { arrowId: arrow.id, label: arrow.label };
            if (source.kind === 'box' && target.kind === 'box') {
              const [fromBox, toBox] = [boxById.get(source.boxId)!, boxById.get(target.boxId)!];
              connections.push({
                ...base,
                from: { point: slot(fromBox, 'right', arrow), heading: 'east' },
                to: { point: slot(toBox, target.side, arrow), heading: ENTRY_HEADING[target.side as 'left'] },
                fromBoxId: fromBox.id,
                toBoxId: toBox.id,
              });
            } else if (source.kind === 'box' && target.kind === 'boundary') {
              const fromBox = boxById.get(source.boxId)!;
              const from = slot(fromBox, 'right', arrow);
              connections.push({
                ...base,
                from: { point: from, heading: 'east' },
                to: { point: { x: right(frame), y: from.y }, heading: 'east' },
                fromBoxId: fromBox.id,
                toBoundary: { side: 'right', code: target.code },
              });
            } else if (source.kind === 'boundary' && target.kind === 'box') {
              const toBox = boxById.get(target.boxId)!;
              const to = slot(toBox, target.side, arrow);
              connections.push({
                ...base,
                from: frameEntry(source.side, target.side, toBox, to),
                to: { point: to, heading: ENTRY_HEADING[target.side as 'left'] },
                toBoxId: toBox.id,
                fromBoundary: { side: source.side, code: source.code },
              });
            }
          }
        }
      }

      return { ...state, connections: fanOutAroundSingleBox(state, connections, deps) };
    },
  };
}

/**
 * Around a single box (the context diagram) the top and bottom slots are too
 * close for the labels that sit beside each boundary arrow. This moves the
 * frame crossings apart, outward from the middle arrow, by as much as each
 * label needs; the router then bends each arrow back to its slot.
 * With several boxes a moved arrow could pass through a neighbour, so those
 * diagrams keep straight arrows until label placement arrives.
 */
function fanOutAroundSingleBox(state: LayoutState, connections: Connection[], deps: LayoutDeps): Connection[] {
  if (state.boxes.length !== 1) return connections;
  let result = connections;
  for (const edge of ['top', 'bottom'] as const) {
    const fan = result
      .filter((c) => c.fromBoundary?.side === edge && c.from.point.x === c.to.point.x)
      .sort((a, b) => a.to.point.x - b.to.point.x);
    if (fan.length < 2) continue;

    const slotGap = (i: number): number => fan[i + 1]!.to.point.x - fan[i]!.to.point.x;
    /** Distance needed between arrow i and the next one so that arrow i's label fits between them. */
    const gap = (i: number): number =>
      Math.max(slotGap(i), Math.ceil(boundaryLabelExtent(widestLine(verticalLabelLines(fan[i]!.label, deps), deps), deps.options)));
    if (fan.every((_, i) => i === fan.length - 1 || gap(i) === slotGap(i))) continue;

    // Keep the middle arrow straight (or the middle pair centred) and work outward.
    const x: number[] = [];
    const mid = Math.floor((fan.length - 1) / 2);
    if (fan.length % 2 === 1) {
      x[mid] = fan[mid]!.to.point.x;
    } else {
      const centre = (fan[mid]!.to.point.x + fan[mid + 1]!.to.point.x) / 2;
      x[mid] = Math.round(centre - gap(mid) / 2);
    }
    for (let i = mid + 1; i < fan.length; i++) x[i] = x[i - 1]! + gap(i - 1);
    for (let i = mid - 1; i >= 0; i--) x[i] = x[i + 1]! - gap(i);

    const moved = new Map(fan.map((c, i) => [c, { ...c, from: { ...c.from, point: { x: x[i]!, y: c.from.point.y } } }]));
    result = result.map((c) => moved.get(c) ?? c);
  }
  return result;
}
