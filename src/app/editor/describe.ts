/** Words for model elements, shared by the panels so an arrow end reads the same everywhere. */
import {
  boundaryCode,
  CONTEXT_DIAGRAM,
  diagramExists,
  getFunction,
  nodeNumber,
  parentOf,
  type Arrow,
  type ArrowSource,
  type ArrowTarget,
  type DiagramId,
  type Model,
  type Role,
} from '../../domain';

export const ROLE_TITLE: Record<Role, string> = { input: 'Inputs', control: 'Controls', output: 'Outputs', mechanism: 'Mechanisms' };

export function describeFunction(model: Model, functionId: string): string {
  return `${nodeNumber(model, functionId)} ${getFunction(model, functionId).label}`;
}

const LINK_TEXT = { inherited: 'from the parent diagram', split: 'part of a parent arrow', external: 'outside the model', tunneled: 'tunneled' } as const;

export function describeSource(model: Model, arrow: Arrow, source: ArrowSource): string {
  if (source.kind === 'function') return describeFunction(model, source.functionId);
  const code = boundaryCode(model, arrow, 'source');
  return `Boundary${code ? ` ${code}` : ''}, ${LINK_TEXT[source.link.kind]}`;
}

export function describeTarget(model: Model, arrow: Arrow, target: ArrowTarget): string {
  if (target.kind === 'function') return `${describeFunction(model, target.functionId)}, as ${target.role}`;
  const code = boundaryCode(model, arrow, 'target');
  return `Boundary${code ? ` ${code}` : ''}, ${LINK_TEXT[target.link.kind]}`;
}

/** The diagrams from A-0 down to the given one, for the breadcrumb. */
export function diagramPath(model: Model, diagramId: DiagramId): DiagramId[] {
  const path: DiagramId[] = [];
  let current: string | undefined = diagramId === CONTEXT_DIAGRAM ? undefined : diagramId;
  while (current !== undefined) {
    if (diagramExists(model, current)) path.unshift(current);
    current = parentOf(model, current);
  }
  return [CONTEXT_DIAGRAM, ...path];
}
