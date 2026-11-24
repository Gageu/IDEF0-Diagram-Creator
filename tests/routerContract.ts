import { expect, it } from 'vitest';
import type { Point } from '../src/geometry/geometry';
import type { Connection, Heading, Router, RoutingScene } from '../src/layout';

const HEADING_VECTOR: Record<Heading, Point> = { east: { x: 1, y: 0 }, south: { x: 0, y: 1 }, north: { x: 0, y: -1 } };

/** Two boxes of a staircase and one run of every kind the layout produces. */
function scene(): RoutingScene {
  const first = { id: 'b1', rect: { x: 200, y: 150, width: 150, height: 80 } };
  const second = { id: 'b2', rect: { x: 400, y: 270, width: 150, height: 80 } };
  const c = (from: [number, number, Heading], to: [number, number, Heading], ends: Partial<Connection>): Connection => ({
    arrowId: `${from.join(',')}>${to.join(',')}`,
    netId: `${from.join(',')}>${to.join(',')}`,
    head: true,
    from: { point: { x: from[0], y: from[1] }, heading: from[2] },
    to: { point: { x: to[0], y: to[1] }, heading: to[2] },
    ...ends,
  });
  return {
    frame: { x: 20, y: 20, width: 1060, height: 540 },
    boxes: [first, second],
    connections: [
      c([20, 190, 'east'], [200, 190, 'east'], { toBoxId: 'b1' }), // boundary input
      c([275, 20, 'south'], [275, 150, 'south'], { toBoxId: 'b1' }), // boundary control
      c([120, 20, 'south'], [250, 150, 'south'], { toBoxId: 'b1' }), // offset control
      c([275, 560, 'north'], [275, 230, 'north'], { toBoxId: 'b1' }), // boundary mechanism
      c([550, 310, 'east'], [1080, 310, 'east'], { fromBoxId: 'b2' }), // boundary output
      c([350, 190, 'east'], [400, 310, 'east'], { fromBoxId: 'b1', toBoxId: 'b2' }), // forward input
      c([350, 190, 'east'], [475, 270, 'south'], { fromBoxId: 'b1', toBoxId: 'b2' }), // forward control
      c([350, 190, 'east'], [475, 350, 'north'], { fromBoxId: 'b1', toBoxId: 'b2' }), // forward mechanism
      c([550, 310, 'east'], [200, 190, 'east'], { fromBoxId: 'b2', toBoxId: 'b1' }), // input feedback
      c([550, 310, 'east'], [275, 150, 'south'], { fromBoxId: 'b2', toBoxId: 'b1' }), // control feedback
      c([250, 510, 'east'], [450, 350, 'north'], { toBoxId: 'b2' }), // branch off a bottom lane
      c([250, 80, 'east'], [450, 270, 'south'], { toBoxId: 'b2' }), // branch off a top lane
      c([70, 190, 'south'], [400, 330, 'east'], { toBoxId: 'b2' }), // branch off a left lane
      c([550, 330, 'east'], [650, 190, 'north'], { fromBoxId: 'b2', via: [{ x: 650, y: 330 }] }), // join onto a right lane
    ],
  };
}

/**
 * The behaviour every `Router` must have. Each implementation runs this same
 * suite, which is what makes routers interchangeable (Liskov substitution).
 */
export function describeRouterContract(createRouter: () => Router): void {
  const input = scene();
  const paths = createRouter().route(input);

  it('returns one path per connection, in order, from its start point to its end point', () => {
    expect(paths).toHaveLength(input.connections.length);
    input.connections.forEach((c, i) => {
      expect(paths[i]![0]).toEqual(c.from.point);
      expect(paths[i]![paths[i]!.length - 1]).toEqual(c.to.point);
    });
  });

  it('uses only horizontal and vertical segments', () => {
    for (const path of paths) {
      path.slice(1).forEach((p, i) => expect(p.x === path[i]!.x || p.y === path[i]!.y).toBe(true));
    }
  });

  it('leaves and arrives along the headings of the two ports', () => {
    const direction = (a: Point, b: Point): Point => ({ x: Math.sign(b.x - a.x), y: Math.sign(b.y - a.y) });
    input.connections.forEach((c, i) => {
      const path = paths[i]!;
      expect(direction(path[0]!, path[1]!), `${c.arrowId} start`).toEqual(HEADING_VECTOR[c.from.heading]);
      expect(direction(path[path.length - 2]!, path[path.length - 1]!), `${c.arrowId} end`).toEqual(HEADING_VECTOR[c.to.heading]);
    });
  });

  it('passes through the via points of a connection', () => {
    input.connections.forEach((c, i) => {
      for (const via of c.via ?? []) expect(paths[i]).toContainEqual(via);
    });
  });

  it('does not pass through a box', () => {
    for (const path of paths) {
      path.slice(1).forEach((b, i) => {
        const a = path[i]!;
        for (const { rect } of input.boxes) {
          const inside = Math.max(a.x, b.x) > rect.x && Math.min(a.x, b.x) < rect.x + rect.width && Math.max(a.y, b.y) > rect.y && Math.min(a.y, b.y) < rect.y + rect.height;
          expect(inside).toBe(false);
        }
      });
    }
  });
}
