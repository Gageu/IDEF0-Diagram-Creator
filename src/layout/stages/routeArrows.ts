import type { Router } from '../router';
import type { LayoutStage } from '../state';

/**
 * Stage 4: hands the fixed end points to a router and records its paths.
 * The stage knows only the `Router` interface, so routers are swapped in
 * the app shell without touching the pipeline.
 */
export function createRouteArrowsStage(router: Router): LayoutStage {
  return {
    name: `route-arrows (${router.name})`,
    run(state) {
      const paths = router.route({
        frame: state.frame,
        boxes: state.boxes.map((b) => ({ id: b.id, rect: b.rect })),
        connections: state.connections,
      });
      return {
        ...state,
        routes: state.connections.map((c, i) => ({ arrowId: c.arrowId, points: paths[i] ?? [c.from.point, c.to.point], head: true })),
      };
    },
  };
}
