import type { DiagramId, Model } from '../domain';
import type { DiagramGeometry } from '../geometry/geometry';
import { initialState, type LayoutStage, type LayoutState } from './state';
import { buildDiagramView, type DiagramView } from './view';

/** Selects one diagram from the model. Another notation would supply its own builder. */
export type ViewBuilder = (model: Model, diagramId: DiagramId) => DiagramView;

export interface LayoutPipeline {
  readonly stages: readonly LayoutStage[];
  /** Lays out one diagram of the model and returns its plain geometry. */
  layout(model: Model, diagramId: DiagramId): DiagramGeometry;
}

/**
 * Pipes and filters: the view is built from the model, then each stage turns
 * one layout state into the next. Stages are listed by the caller, so adding,
 * replacing or reordering one never edits another.
 */
export function createLayoutPipeline(stages: readonly LayoutStage[], buildView: ViewBuilder = buildDiagramView): LayoutPipeline {
  return {
    stages,
    layout(model, diagramId) {
      const final = stages.reduce((state, stage) => stage.run(state), initialState(buildView(model, diagramId)));
      return toGeometry(final);
    },
  };
}

function toGeometry(state: LayoutState): DiagramGeometry {
  return {
    size: state.size,
    frame: state.frame,
    footer: { node: state.view.node, title: state.view.title, number: state.view.number },
    boxes: state.boxes,
    arrows: state.routes,
    texts: state.texts,
    leaders: state.leaders,
    defects: state.defects,
  };
}
