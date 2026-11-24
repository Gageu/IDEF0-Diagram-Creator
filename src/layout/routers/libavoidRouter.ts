/**
 * Adapter for libavoid-js, the WebAssembly build of the libavoid connector
 * router. This is the only file that knows libavoid exists: everything it
 * takes and returns is the pipeline's own `Router` vocabulary.
 */
import { AvoidLib } from 'libavoid-js';
import { bottom, right, type Point, type Rect } from '../../geometry/geometry';
import type { Router, RoutingScene } from '../router';
import type { Connection, Heading } from '../state';

export interface LibavoidRouterOptions {
  /** Where to fetch `libavoid.wasm` from. Needed in a browser bundle; Node finds it by itself. */
  readonly wasmUrl?: string;
  /** Free space kept between an arrow and a box it passes. */
  readonly boxClearance: number;
  /** Distance between arrows that run side by side. */
  readonly arrowSpacing: number;
  /** Routes the rare connection libavoid finds no path for. */
  readonly fallback: Router;
}

type Avoid = ReturnType<typeof AvoidLib.getInstance>;

/** Loads the WebAssembly module once and returns a router that uses it. */
export async function createLibavoidRouter(options: LibavoidRouterOptions): Promise<Router> {
  await AvoidLib.load(options.wasmUrl);
  const avoid = AvoidLib.getInstance();
  return {
    name: 'libavoid',
    route: (scene) => routeScene(avoid, scene, options),
  };
}

function routeScene(avoid: Avoid, scene: RoutingScene, options: LibavoidRouterOptions): Point[][] {
  const { ConnDirFlag, RoutingParameter, RoutingOption } = avoid;
  const router = new avoid.Router(avoid.RouterFlag.OrthogonalRouting);
  try {
    router.setRoutingParameter(RoutingParameter.shapeBufferDistance, options.boxClearance);
    router.setRoutingParameter(RoutingParameter.idealNudgingDistance, options.arrowSpacing);
    router.setRoutingParameter(RoutingParameter.segmentPenalty, 50);
    router.setRoutingParameter(RoutingParameter.crossingPenalty, 100);
    // Arrow ends are fixed slots, so segments that touch a box must not be moved.
    router.setRoutingOption(RoutingOption.nudgeOrthogonalSegmentsConnectedToShapes, false);
    // Connections of one net start or end together and are meant to share a path.
    router.setRoutingOption(RoutingOption.nudgeSharedPathsWithCommonEndPoint, false);
    router.setRoutingOption(RoutingOption.penaliseOrthogonalSharedPathsAtConnEnds, false);

    for (const wall of frameWalls(scene.frame, options.boxClearance + 2)) router.addShape(wall);

    const shapes = new Map(scene.boxes.map((box) => [box.id, { ref: router.addShape(box.rect), rect: box.rect, pins: new Map<string, number>() }]));
    let nextPinClass = 1;
    const leaving: Record<Heading, number> = { east: ConnDirFlag.ConnDirRight, south: ConnDirFlag.ConnDirDown, north: ConnDirFlag.ConnDirUp };
    const arriving: Record<Heading, number> = { east: ConnDirFlag.ConnDirLeft, south: ConnDirFlag.ConnDirUp, north: ConnDirFlag.ConnDirDown };

    /** A box end is a pin at the slot; any other end is a free point. Both leave in one fixed direction. */
    const end = (boxId: string | undefined, point: Point, directions: number) => {
      const shape = boxId === undefined ? undefined : shapes.get(boxId);
      if (!shape) return { x: point.x, y: point.y, directions };
      const key = `${point.x},${point.y}`;
      let classId = shape.pins.get(key);
      if (classId === undefined) {
        classId = nextPinClass++;
        shape.ref
          .addPin({ classId, x: point.x - shape.rect.x, y: point.y - shape.rect.y, proportional: false, directions })
          .setExclusive(false);
        shape.pins.set(key, classId);
      }
      return { shape: shape.ref, pin: classId };
    };

    const connectors = scene.connections.map((c) => {
      const connector = router.addConnector(end(c.fromBoxId, c.from.point, leaving[c.from.heading]), end(c.toBoxId, c.to.point, arriving[c.to.heading]));
      if (c.via && c.via.length > 0) connector.setRoutingCheckpoints(c.via);
      return connector;
    });
    router.processTransaction();

    const fallback = options.fallback.route(scene);
    return scene.connections.map((c, i) => {
      const connector = connectors[i]!;
      const path = tidy(connector.displayRoute(), c);
      return connector.hasValidRoute() && isUsable(path, c) ? path : [...fallback[i]!];
    });
  } finally {
    router.delete();
  }
}

/** Obstacles just outside the frame, so no arrow is routed around the outside of it. */
function frameWalls(frame: Rect, gap: number): Rect[] {
  const t = 20;
  return [
    { x: frame.x - gap - t, y: frame.y - gap - t, width: t, height: frame.height + 2 * (gap + t) },
    { x: right(frame) + gap, y: frame.y - gap - t, width: t, height: frame.height + 2 * (gap + t) },
    { x: frame.x - gap, y: frame.y - gap - t, width: frame.width + 2 * gap, height: t },
    { x: frame.x - gap, y: bottom(frame) + gap, width: frame.width + 2 * gap, height: t },
  ];
}

/** Whole-pixel points with the exact end points restored and no point in the middle of a straight run. */
function tidy(route: readonly Point[], c: Connection): Point[] {
  const points = route.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
  if (points.length >= 2) {
    points[0] = c.from.point;
    points[points.length - 1] = c.to.point;
  }
  return points.filter((p, i) => {
    const [before, after] = [points[i - 1], points[i + 1]];
    if (!before) return true;
    if (p.x === before.x && p.y === before.y) return false;
    if (!after) return true;
    return !((before.x === p.x && p.x === after.x) || (before.y === p.y && p.y === after.y));
  });
}

function isUsable(path: readonly Point[], c: Connection): boolean {
  if (path.length < 2) return false;
  const orthogonal = path.slice(1).every((p, i) => p.x === path[i]!.x || p.y === path[i]!.y);
  const [last, beforeLast] = [path[path.length - 1]!, path[path.length - 2]!];
  const arrives =
    c.to.heading === 'east' ? last.y === beforeLast.y && last.x > beforeLast.x
    : c.to.heading === 'south' ? last.x === beforeLast.x && last.y > beforeLast.y
    : last.x === beforeLast.x && last.y < beforeLast.y;
  const passesVia = (c.via ?? []).every((v) => path.some((p) => p.x === v.x && p.y === v.y));
  return orthogonal && arrives && passesVia;
}
