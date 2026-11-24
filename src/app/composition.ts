/**
 * The app shell: the one place that names concrete implementations. Which
 * router, which stages, which theme and which text measurer are all chosen
 * here, and every other module sees only interfaces.
 */
import type { DiagramId, Model } from '../domain';
import {
  approximateTextMeasurer,
  createAssignSlotsStage,
  createCheckLayoutStage,
  createLayoutPipeline,
  createLibavoidRouter,
  createMergeBusesStage,
  createNaiveRouter,
  createPlaceBoxesStage,
  createPlaceLabelsStage,
  createPlaceNoteStage,
  createPlanConnectionsStage,
  createRouteArrowsStage,
  referenceLayoutOptions,
  widenGaps,
  withQualityGate,
  type LayoutDeps,
  type LayoutOptions,
  type LayoutPipeline,
  type Router,
} from '../layout';
import { renderSvg } from '../render/svgRenderer';
import { referenceTheme } from '../theme/theme';

export const theme = referenceTheme;

function layoutDeps(options: LayoutOptions): LayoutDeps {
  return { options, theme, measurer: approximateTextMeasurer };
}

/** The router with no dependencies: fixed path shapes, no obstacle search. */
export function naiveRouter(): Router {
  return createNaiveRouter(referenceLayoutOptions.routing);
}

/**
 * The router the app uses. It loads a WebAssembly module, so it is created
 * once at start-up. `wasmUrl` is where a browser bundle serves that module.
 */
export function loadRouter(wasmUrl?: string): Promise<Router> {
  return createLibavoidRouter({
    ...(wasmUrl === undefined ? {} : { wasmUrl }),
    boxClearance: referenceLayoutOptions.routing.boxClearance,
    arrowSpacing: referenceLayoutOptions.routing.arrowSpacing,
    fallback: naiveRouter(),
  });
}

/** One pass through every stage with the given distances. */
function createSinglePassPipeline(router: Router, options: LayoutOptions): LayoutPipeline {
  const deps = layoutDeps(options);
  return createLayoutPipeline([
    createPlaceBoxesStage(deps),
    createAssignSlotsStage(),
    createPlanConnectionsStage(deps),
    createRouteArrowsStage(router),
    createMergeBusesStage(),
    createPlaceNoteStage(deps),
    createPlaceLabelsStage(deps),
    createCheckLayoutStage(deps),
  ]);
}

/** The full layout: the stages above, retried with more room while the check stage finds problems. */
export function createPipeline(router: Router): LayoutPipeline {
  return withQualityGate((options) => createSinglePassPipeline(router, options), {
    baseOptions: referenceLayoutOptions,
    maxAttempts: 4,
    relax: widenGaps,
  });
}

export type DrawDiagram = (model: Model, diagramId: DiagramId) => string;

/** Model in, SVG string out: the preview and the export are this same string. */
export function createDrawDiagram(router: Router): DrawDiagram {
  const pipeline = createPipeline(router);
  return (model, diagramId) => renderSvg(pipeline.layout(model, diagramId), theme);
}
