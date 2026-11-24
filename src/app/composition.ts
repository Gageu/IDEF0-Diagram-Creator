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
} from '../layout';
import { renderSvg } from '../render/svgRenderer';
import { referenceTheme } from '../theme/theme';

const deps: LayoutDeps = {
  options: referenceLayoutOptions,
  theme: referenceTheme,
  measurer: approximateTextMeasurer,
};

export const layoutPipeline: LayoutPipeline = createLayoutPipeline([
  createPlaceBoxesStage(deps),
  createAssignSlotsStage(),
  createPlanConnectionsStage(deps),
  createRouteArrowsStage(createNaiveRouter(deps.options.routing)),
  createMergeBusesStage(),
  createPlaceLabelsStage(deps),
  createPlaceNoteStage(deps),
]);

/** Model in, SVG string out: the preview and the export are this same string. */
export function drawDiagram(model: Model, diagramId: DiagramId): string {
  return renderSvg(layoutPipeline.layout(model, diagramId), deps.theme);
}
