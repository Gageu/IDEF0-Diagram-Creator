import { bottom, right, type Point } from '../../geometry/geometry';
import { boundaryLabelExtent, verticalLabelLines, widestLine, type LayoutDeps } from '../boundaryLabel';
import { slotKey, type Connection, type Heading, type LabelAnchor, type LayoutStage, type LayoutState, type PlacedBox } from '../state';
import type { Side, ViewArrow, ViewBundle, ViewEnd } from '../view';

type EntrySide = Exclude<Side, 'right'>;
const ENTRY_HEADING: Record<EntrySide, Heading> = { left: 'east', top: 'south', bottom: 'north' };

/** A box end of an arrow, with its fixed point. */
interface BoxEnd {
  readonly arrow: ViewArrow;
  readonly box: PlacedBox;
  readonly side: Side;
  readonly point: Point;
}

/** Everything that crosses the frame at one place: one arrow, or a bundle and the splits that share it. */
interface BoundaryGroup {
  readonly netId: string;
  readonly side: Side;
  readonly code: string | undefined;
  readonly bundle: ViewBundle | undefined;
  readonly ends: BoxEnd[];
}

/**
 * Plans how every arrow is drawn as point-to-point connections for the
 * router, and where its labels belong.
 *
 * An arrow that crosses the frame and serves several boxes becomes a rake: it
 * runs straight to its first box, and a lane beside the frame edge carries
 * the branches to the others. Because of the staircase, the lane and its
 * branches never meet a box. Arrows between boxes become one connection per
 * source and target, and the merge stage later draws their shared path once.
 */
export function createPlanConnectionsStage(deps: LayoutDeps): LayoutStage {
  const { routing, lanes } = deps.options;

  return {
    name: 'plan-connections',
    run(state) {
      const { view, frame } = state;
      const boxById = new Map(state.boxes.map((b) => [b.id, b]));
      const order = new Map(state.boxes.map((b, i) => [b.id, i]));
      const connections: Connection[] = [];
      const anchors: LabelAnchor[] = [];

      const boxEnds = (arrow: ViewArrow, ends: readonly ViewEnd[]): BoxEnd[] =>
        ends.flatMap((end) =>
          end.kind === 'box'
            ? [{ arrow, box: boxById.get(end.boxId)!, side: end.side, point: state.slots[slotKey(end.boxId, end.side, arrow.id)]! }]
            : [],
        );

      const groups = (direction: 'in' | 'out'): BoundaryGroup[] => {
        const byNet = new Map<string, BoundaryGroup>();
        for (const arrow of view.arrows) {
          const boundary = (direction === 'in' ? arrow.sources : arrow.targets).find((e) => e.kind === 'boundary');
          if (boundary?.kind !== 'boundary') continue;
          const netId = `${direction}:${boundary.bundle?.id ?? arrow.id}`;
          const group = byNet.get(netId) ?? { netId, side: boundary.side, code: boundary.code, bundle: boundary.bundle, ends: [] };
          group.ends.push(...boxEnds(arrow, direction === 'in' ? arrow.targets : arrow.sources));
          byNet.set(netId, group);
        }
        return [...byNet.values()].filter((g) => g.ends.length > 0);
      };

      /** A bundle of several splits is labelled at the frame and each split on its branch; anything else once, at the frame. */
      const label = (group: BoundaryGroup, point: Point, edge: Side): void => {
        const members = new Set(group.ends.map((e) => e.arrow.id));
        const first = group.ends[0]!.arrow;
        const text = group.bundle && members.size > 1 ? group.bundle.label : first.label;
        anchors.push({ arrowId: first.id, text, code: group.code, point, edge, run: edge === 'left' || edge === 'right' ? 'horizontal' : 'vertical' });
      };
      const branchLabel = (group: BoundaryGroup, end: BoxEnd, point: Point, run: LabelAnchor['run']): void => {
        const alreadyAtFrame = !group.bundle || new Set(group.ends.map((e) => e.arrow.id)).size === 1;
        if (!alreadyAtFrame) anchors.push({ arrowId: end.arrow.id, text: end.arrow.label, code: undefined, point, edge: 'none', run });
      };

      // Arrows entering through the frame.
      const laneCount: Record<Side, number> = { left: 0, top: 0, right: 0, bottom: 0 };
      for (const group of groups('in')) {
        const side = group.side as EntrySide;
        const inLine = group.ends.filter((e) => e.side === side).sort((a, b) => order.get(a.box.id)! - order.get(b.box.id)!);
        const others = group.ends.filter((e) => e.side !== side);
        const first = inLine[0];
        const heading = ENTRY_HEADING[side];
        const base = { netId: group.netId, head: true };

        if (!first) {
          // No box takes the arrow on the side it enters from: come in beside the first box and let the router turn.
          const target = others[0]!;
          const entry = offsetEntry(state, side, target, routing.loopClearance);
          label(group, entry, side);
          for (const end of others) {
            connections.push({ ...base, arrowId: end.arrow.id, from: { point: entry, heading }, to: { point: end.point, heading: ENTRY_HEADING[end.side as EntrySide] }, toBoxId: end.box.id });
          }
          continue;
        }

        const entry: Point =
          side === 'left' ? { x: frame.x, y: first.point.y } : { x: first.point.x, y: side === 'top' ? frame.y : bottom(frame) };
        label(group, entry, side);
        connections.push({ ...base, arrowId: first.arrow.id, from: { point: entry, heading }, to: { point: first.point, heading }, toBoxId: first.box.id });
        const rest = [...inLine.slice(1), ...others];
        if (rest.length === 0) continue;

        const lane = laneCount[side]++;
        const tee: Point =
          side === 'left'
            ? { x: frame.x + lanes.inset + lane * lanes.spacing, y: entry.y }
            : { x: entry.x, y: side === 'top' ? frame.y + lanes.topInset + lane * lanes.spacing : bottom(frame) - lanes.inset - lane * lanes.spacing };
        const along: Heading = side === 'left' ? 'south' : 'east';
        branchLabel(group, first, side === 'left' ? { x: first.box.rect.x - routing.stub, y: first.point.y } : { x: first.point.x, y: side === 'top' ? first.box.rect.y - routing.stub : bottom(first.box.rect) + routing.stub }, side === 'left' ? 'horizontal' : 'vertical');
        for (const end of rest) {
          // A branch to the same side of its box has one corner, where it leaves the lane.
          const corner = end.side !== side ? [] : [side === 'left' ? { x: tee.x, y: end.point.y } : { x: end.point.x, y: tee.y }];
          connections.push({ ...base, arrowId: end.arrow.id, from: { point: tee, heading: along }, to: { point: end.point, heading: ENTRY_HEADING[end.side as EntrySide] }, toBoxId: end.box.id, via: corner });
          if (end.side === side) {
            branchLabel(group, end, side === 'left' ? { x: tee.x, y: end.point.y } : { x: end.point.x, y: side === 'top' ? end.box.rect.y - routing.stub : bottom(end.box.rect) + routing.stub }, side === 'left' ? 'horizontal' : 'vertical');
          }
        }
      }

      // Arrows leaving through the frame: the first box runs straight out, the others join it on a lane.
      const lastBoxRight = Math.max(...state.boxes.map((b) => right(b.rect)));
      for (const group of groups('out')) {
        const ends = [...group.ends].sort((a, b) => a.point.y - b.point.y);
        const first = ends[0]!;
        const exit = { x: right(frame), y: first.point.y };
        label(group, exit, 'right');
        connections.push({ netId: group.netId, arrowId: first.arrow.id, head: true, from: { point: first.point, heading: 'east' }, to: { point: exit, heading: 'east' }, fromBoxId: first.box.id });
        if (ends.length === 1) continue;
        const join = { x: lastBoxRight + 2 * routing.stub + laneCount.right++ * lanes.spacing, y: first.point.y };
        for (const end of ends) {
          branchLabel(group, end, end.point, 'horizontal');
          if (end === first) continue;
          connections.push({ netId: group.netId, arrowId: end.arrow.id, head: false, from: { point: end.point, heading: 'east' }, to: { point: join, heading: 'north' }, fromBoxId: end.box.id, via: [{ x: join.x, y: end.point.y }] });
        }
      }

      // Arrows between boxes: one connection per source and target.
      for (const arrow of view.arrows) {
        const sources = boxEnds(arrow, arrow.sources);
        const targets = boxEnds(arrow, arrow.targets);
        if (sources.length > 0 && targets.length > 0) {
          anchors.push({ arrowId: arrow.id, text: arrow.label, code: undefined, point: sources[0]!.point, edge: 'none', run: 'horizontal' });
        }
        for (const source of sources) {
          for (const target of targets) {
            connections.push({
              netId: `arrow:${arrow.id}`,
              arrowId: arrow.id,
              head: true,
              from: { point: source.point, heading: 'east' },
              to: { point: target.point, heading: ENTRY_HEADING[target.side as EntrySide] },
              fromBoxId: source.box.id,
              toBoxId: target.box.id,
            });
          }
        }
      }

      const fanned = fanOutAroundSingleBox(state, connections, anchors, deps);
      return { ...state, ...fanned };
    },
  };
}

/** Where a boundary arrow crosses the frame when its box takes it on a different side. */
function offsetEntry(state: LayoutState, side: EntrySide, target: BoxEnd, clearance: number): Point {
  const { frame } = state;
  const { rect } = target.box;
  if (side === 'left') return { x: frame.x, y: target.side === 'top' ? rect.y - clearance : bottom(rect) + clearance };
  return { x: rect.x - clearance, y: side === 'top' ? frame.y : bottom(frame) };
}

/**
 * Around a single box (the context diagram) the top and bottom slots are too
 * close for the labels that sit beside each boundary arrow. This moves the
 * frame crossings apart, outward from the middle arrow, by as much as each
 * label needs; the router then bends each arrow back to its slot.
 * With several boxes a moved arrow could pass through a neighbour, so those
 * diagrams keep straight arrows until label placement arrives.
 */
function fanOutAroundSingleBox(
  state: LayoutState,
  connections: Connection[],
  anchors: LabelAnchor[],
  deps: LayoutDeps,
): { connections: Connection[]; anchors: LabelAnchor[] } {
  if (state.boxes.length !== 1) return { connections, anchors };
  const edgeY = { top: state.frame.y, bottom: bottom(state.frame) };
  for (const edge of ['top', 'bottom'] as const) {
    const fan = connections
      .filter((c) => c.fromBoxId === undefined && c.from.point.y === edgeY[edge] && c.from.point.x === c.to.point.x)
      .sort((a, b) => a.to.point.x - b.to.point.x);
    if (fan.length < 2) continue;
    const labelOf = (c: Connection): string => anchors.find((a) => a.edge === edge && a.point.x === c.from.point.x)?.text ?? '';

    const slotGap = (i: number): number => fan[i + 1]!.to.point.x - fan[i]!.to.point.x;
    /** Distance needed between arrow i and the next one so that arrow i's label fits between them. */
    const gap = (i: number): number =>
      Math.max(slotGap(i), Math.ceil(boundaryLabelExtent(widestLine(verticalLabelLines(labelOf(fan[i]!), deps), deps), deps.options)));
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

    const movedTo = new Map(fan.map((c, i) => [c.from.point.x, x[i]!]));
    const move = (p: Point): Point => ({ x: movedTo.get(p.x) ?? p.x, y: p.y });
    anchors = anchors.map((a) => (a.edge === edge ? { ...a, point: move(a.point) } : a));
    connections = connections.map((c) => (fan.includes(c) ? { ...c, from: { ...c.from, point: move(c.from.point) } } : c));
  }
  return { connections, anchors };
}
