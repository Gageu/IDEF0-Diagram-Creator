/**
 * Stage 1 of the pipeline: one diagram's boxes and arrows selected from the
 * model, with everything derived (numbers, sides, ICOM codes) already
 * resolved. Later stages work from this view and never read the model.
 */
import {
  arrowsOn,
  boundaryCode,
  boundarySourceRole,
  CONTEXT_DIAGRAM,
  diagramNode,
  diagramNumber,
  diagramTitle,
  functionsOn,
  inheritedBoundary,
  nodeNumber,
  type DiagramId,
  type InheritedBoundaryArrow,
  type Model,
  type Role,
} from '../domain';

export type Side = 'left' | 'top' | 'right' | 'bottom';

/** IDEF0 rule B3: each role has its own side of the box. */
export const SIDE_OF_ROLE: Record<Role, Side> = { input: 'left', control: 'top', output: 'right', mechanism: 'bottom' };

export interface ViewBox {
  readonly id: string;
  readonly label: string;
  readonly number: string;
}

export type ViewEnd =
  | { readonly kind: 'box'; readonly boxId: string; readonly side: Side }
  | { readonly kind: 'boundary'; readonly side: Side; readonly code: string | undefined; readonly tunneled: boolean };

export interface ViewArrow {
  readonly id: string;
  readonly label: string;
  readonly sources: readonly ViewEnd[];
  readonly targets: readonly ViewEnd[];
}

export interface DiagramView {
  readonly diagramId: DiagramId;
  readonly isContext: boolean;
  readonly node: string;
  readonly title: string;
  readonly number: string;
  readonly boxes: readonly ViewBox[];
  readonly arrows: readonly ViewArrow[];
  /** Parent arrows that no arrow on this diagram carries in yet. */
  readonly unconnected: readonly InheritedBoundaryArrow[];
  /** Paragraphs of the purpose / viewpoint / context note; context diagram only. */
  readonly note: readonly string[];
}

export function buildDiagramView(model: Model, diagramId: DiagramId): DiagramView {
  const isContext = diagramId === CONTEXT_DIAGRAM;
  const arrows = arrowsOn(model, diagramId).map((arrow): ViewArrow => {
    const sourceRole = boundarySourceRole(model, arrow);
    return {
      id: arrow.id,
      label: arrow.label,
      sources: arrow.sources.flatMap((source): ViewEnd[] => {
        if (source.kind === 'function') return [{ kind: 'box', boxId: source.functionId, side: 'right' }];
        if (sourceRole === undefined) return [];
        return [{
          kind: 'boundary',
          side: SIDE_OF_ROLE[sourceRole],
          code: boundaryCode(model, arrow, 'source'),
          tunneled: source.link.kind === 'tunneled',
        }];
      }),
      targets: arrow.targets.map((target): ViewEnd =>
        target.kind === 'function'
          ? { kind: 'box', boxId: target.functionId, side: SIDE_OF_ROLE[target.role] }
          : { kind: 'boundary', side: 'right', code: boundaryCode(model, arrow, 'target'), tunneled: target.link.kind === 'tunneled' },
      ),
    };
  });
  const { purpose, viewpoint, context } = model.info;
  const note = [
    ['Purpose', purpose],
    ['Viewpoint', viewpoint],
    ['Context', context],
  ].flatMap(([name, value]) => (value ? [`${name}: ${value}`] : []));

  return {
    diagramId,
    isContext,
    node: diagramNode(model, diagramId),
    title: diagramTitle(model, diagramId),
    number: diagramNumber(model, diagramId),
    boxes: functionsOn(model, diagramId).map((fn) => ({ id: fn.id, label: fn.label, number: nodeNumber(model, fn.id) })),
    arrows,
    unconnected: inheritedBoundary(model, diagramId).filter((b) => b.state === 'unconnected'),
    note: isContext ? note : [],
  };
}
