import type { ArrowGeometry, Point } from '../../geometry/geometry';
import type { LayoutStage } from '../state';

const same = (a: Point, b: Point): boolean => a.x === b.x && a.y === b.y;
const length = (a: Point, b: Point): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/**
 * How much of the start of `path` runs along `trunk`, both starting at the
 * same point. Returns what is left of `path`, beginning at the point where
 * it leaves the trunk, and the length it shared.
 */
function cutSharedStart(path: readonly Point[], trunk: readonly Point[]): { rest: Point[]; shared: number } {
  if (!same(path[0]!, trunk[0]!)) return { rest: [...path], shared: 0 };
  let shared = 0;
  let i = 1;
  while (i < path.length && i < trunk.length && same(path[i]!, trunk[i]!)) {
    shared += length(path[i - 1]!, path[i]!);
    i++;
  }
  if (i === path.length) return { rest: [], shared };
  const from = path[i - 1]!;
  if (i < trunk.length) {
    // The two leave `from` together if they head the same way; the shorter step is the fork.
    const [p, t] = [path[i]!, trunk[i]!];
    const together = (p.x === from.x && t.x === from.x && Math.sign(p.y - from.y) === Math.sign(t.y - from.y)) ||
      (p.y === from.y && t.y === from.y && Math.sign(p.x - from.x) === Math.sign(t.x - from.x));
    if (together) {
      const pathIsShorter = length(from, p) <= length(from, t);
      const fork = pathIsShorter ? p : t;
      return { rest: pathIsShorter ? path.slice(i) : [fork, ...path.slice(i)], shared: shared + length(from, fork) };
    }
  }
  return { rest: path.slice(i - 1), shared };
}

/**
 * Stage 5: draws the path that connections of one net share only once. A
 * branch keeps the part after it leaves its trunk, so it starts at a
 * T-junction; a join keeps the part before it meets the trunk and loses its
 * arrowhead. Connections of different nets are left alone.
 */
export function createMergeBusesStage(): LayoutStage {
  return {
    name: 'merge-buses',
    run(state) {
      const pathLength = (points: readonly Point[]): number =>
        points.slice(1).reduce((sum, p, i) => sum + length(points[i]!, p), 0);
      // The longest run of a net is its trunk, so shorter runs leave it at clean T-junctions.
      const longestFirst = state.routes
        .map((route, index) => ({ route, index, netId: state.connections[index]!.netId }))
        .sort((a, b) => pathLength(b.route.points) - pathLength(a.route.points) || a.index - b.index);

      const kept = new Map<string, ArrowGeometry[]>();
      const merged: { index: number; route: ArrowGeometry }[] = [];
      for (const { route, index, netId } of longestFirst) {
        const trunks = kept.get(netId) ?? [];
        let best: ArrowGeometry = route;
        let bestShared = 0;
        for (const trunk of trunks) {
          const forward = cutSharedStart(route.points, trunk.points);
          if (forward.shared > bestShared) {
            bestShared = forward.shared;
            best = { ...route, points: forward.rest };
          }
          const backward = cutSharedStart([...route.points].reverse(), [...trunk.points].reverse());
          if (backward.shared > bestShared) {
            bestShared = backward.shared;
            best = { ...route, points: backward.rest.reverse(), head: false };
          }
        }
        kept.set(netId, [...trunks, route]);
        if (best.points.length >= 2) merged.push({ index, route: best });
      }
      const routes = merged.sort((a, b) => a.index - b.index).map((m) => m.route);
      return { ...state, routes };
    },
  };
}
