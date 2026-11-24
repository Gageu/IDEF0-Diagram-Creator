/**
 * The app shell: the one place that names concrete implementations. Which
 * router, which stages, which theme and which text measurer are all chosen
 * here, and every other module sees only interfaces.
 */
import type { DiagramId, Model } from '../domain';
import {
  approximateTextMeasurer,
  createAssignSlotsStage,
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
  type LayoutDeps,
  type LayoutPipeline,
  type Router,
} from '../layout';
import { renderSvg } from '../render/svgRenderer';
import { referenceTheme } from '../theme/theme';

const deps: LayoutDeps = {
  options: referenceLayoutOptions,
  theme: referenceTheme,
  measurer: approximateTextMeasurer,
};

/** The router with no dependencies: fixed path shapes, no obstacle search. */
export function naiveRouter(): Router {
  return createNaiveRouter(deps.options.routing);
}

/**
 * The router the app uses. It loads a WebAssembly module, so it is created
 * once at start-up. `wasmUrl` is where a browser bundle serves that module.
 */
export function loadRouter(wasmUrl?: string): Promise<Router> {
  return createLibavoidRouter({
    ...(wasmUrl === undefined ? {} : { wasmUrl }),
    boxClearance: deps.options.routing.boxClearance,
    arrowSpacing: deps.options.routing.arrowSpacing,
    fallback: naiveRouter(),
  });
}

export function createPipeline(router: Router): LayoutPipeline {
  return createLayoutPipeline([
    createPlaceBoxesStage(deps),
    createAssignSlotsStage(),
    createPlanConnectionsStage(deps),
    createRouteArrowsStage(router),
    createMergeBusesStage(),
    createPlaceLabelsStage(deps),
    createPlaceNoteStage(deps),
  ]);
}

export type DrawDiagram = (model: Model, diagramId: DiagramId) => string;

/** Model in, SVG string out: the preview and the export are this same string. */
export function createDrawDiagram(router: Router): DrawDiagram {
  const pipeline = createPipeline(router);
  return (model, diagramId) => renderSvg(pipeline.layout(model, diagramId), deps.theme);
}
