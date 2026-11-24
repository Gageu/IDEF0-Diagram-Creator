import { bottom, grow, intersects, right, segmentRect, type ArrowGeometry, type Point, type Rect } from '../../geometry/geometry';
import type { LayoutDeps } from '../boundaryLabel';
import type { LabelAnchor, LayoutStage } from '../state';
import { SIDE_OF_ROLE, type Side } from '../view';

/** Length of a stub, and the least distance between a stub and anything else that crosses the same frame edge. */
const STUB_LENGTH = 50;
const STUB_SPACING = 40;

/**
 * Shows each parent arrow that nothing on this diagram is connected to yet:
 * a short dashed arrow at the frame edge it belongs on, with its ICOM code
 * and label. It keeps level consistency visible while a diagram is being
 * built. Stubs take free places along the edge and never move a routed arrow.
 */
export function createStubUnconnectedStage(deps: Pick<LayoutDeps, 'options'>): LayoutStage {
  return {
    name: 'stub-unconnected',
    run(state) {
      if (state.view.unconnected.length === 0) return state;
      const { frame } = state;
      const margin = deps.options.lanes.topInset;
      const obstacles: Rect[] = [
        ...state.boxes.map((b) => grow(b.rect, 4)),
        ...state.routes.flatMap((r) => r.points.slice(1).map((p, i) => segmentRect(r.points[i]!, p, STUB_SPACING / 2))),
      ];
      const routes: ArrowGeometry[] = [];
      const anchors: LabelAnchor[] = [];

      for (const side of ['left', 'top', 'right', 'bottom'] as const) {
        const waiting = state.view.unconnected.filter((u) => SIDE_OF_ROLE[u.role] === side);
        if (waiting.length === 0) continue;
        const horizontalEdge = side === 'top' || side === 'bottom';
        const [from, to] = horizontalEdge ? [frame.x + margin, right(frame) - margin] : [frame.y + margin, bottom(frame) - margin];

        /** The stub that crosses this edge at distance `t` along it, drawn in the direction the arrow flows. */
        const stubAt = (t: number): [Point, Point] => {
          if (side === 'left') return [{ x: frame.x, y: t }, { x: frame.x + STUB_LENGTH, y: t }];
          if (side === 'right') return [{ x: right(frame) - STUB_LENGTH, y: t }, { x: right(frame), y: t }];
          if (side === 'top') return [{ x: t, y: frame.y }, { x: t, y: frame.y + STUB_LENGTH }];
          return [{ x: t, y: bottom(frame) }, { x: t, y: bottom(frame) - STUB_LENGTH }];
        };
        const free: number[] = [];
        for (let t = from; t <= to; t += STUB_SPACING) {
          const [a, b] = stubAt(t);
          if (!obstacles.some((o) => intersects(segmentRect(a, b, 1), o))) free.push(t);
        }
        // Spread the stubs over the free places; with too few places they share the edge evenly instead.
        waiting.forEach((arrow, i) => {
          const t = free.length >= waiting.length
            ? free[Math.floor(((i + 0.5) * free.length) / waiting.length)]!
            : Math.round(from + ((i + 0.5) * (to - from)) / waiting.length);
          const [a, b] = stubAt(t);
          routes.push({ arrowId: arrow.parentArrowId, points: [a, b], head: true, dashed: true });
          anchors.push({
            arrowId: arrow.parentArrowId,
            text: arrow.label,
            code: arrow.code,
            point: side === 'right' ? b : a,
            edge: side satisfies Side,
            run: horizontalEdge ? 'vertical' : 'horizontal',
          });
        });
      }
      return { ...state, routes: [...state.routes, ...routes], anchors: [...state.anchors, ...anchors] };
    },
  };
}
