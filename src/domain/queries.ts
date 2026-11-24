/** Read-only questions about a model. Every derived value lives here. */
import { DomainError } from './errors';
import {
  CONTEXT_DIAGRAM,
  ROLES,
  type Arrow,
  type ArrowId,
  type DiagramId,
  type EntryRole,
  type FunctionId,
  type FunctionNode,
  type Model,
  type ParentLink,
  type Role,
} from './model';

export function getFunction(model: Model, id: FunctionId): FunctionNode {
  const fn = model.functions[id];
  if (!fn) throw new DomainError(`Unknown function "${id}"`);
  return fn;
}

export function getArrow(model: Model, id: ArrowId): Arrow {
  const arrow = model.arrows.find((a) => a.id === id);
  if (!arrow) throw new DomainError(`Unknown arrow "${id}"`);
  return arrow;
}

export function parentOf(model: Model, id: FunctionId): FunctionId | undefined {
  for (const fn of Object.values(model.functions)) {
    if (fn.children.includes(id)) return fn.id;
  }
  return undefined;
}

/** The diagram a function's box is drawn on. */
export function diagramOfFunction(model: Model, id: FunctionId): DiagramId {
  if (id === model.rootId) return CONTEXT_DIAGRAM;
  const parent = parentOf(model, id);
  if (parent === undefined) throw new DomainError(`Function "${id}" is not in the tree`);
  return parent;
}

/** Node number from tree position: A0 for the root, A1..A6 below it, then A21, A22... */
export function nodeNumber(model: Model, id: FunctionId): string {
  const digits: number[] = [];
  let current = id;
  while (current !== model.rootId) {
    const parent = parentOf(model, current);
    if (parent === undefined) throw new DomainError(`Function "${id}" is not in the tree`);
    digits.unshift(getFunction(model, parent).children.indexOf(current) + 1);
    current = parent;
  }
  return digits.length === 0 ? 'A0' : `A${digits.join('')}`;
}

export function diagramExists(model: Model, diagramId: DiagramId): boolean {
  if (diagramId === CONTEXT_DIAGRAM) return true;
  return (model.functions[diagramId]?.children.length ?? 0) > 0;
}

/** All diagrams, context first, then decomposed functions in tree order. */
export function diagramIds(model: Model): DiagramId[] {
  const ids: DiagramId[] = [CONTEXT_DIAGRAM];
  const visit = (id: FunctionId): void => {
    const fn = getFunction(model, id);
    if (fn.children.length === 0) return;
    ids.push(id);
    fn.children.forEach(visit);
  };
  visit(model.rootId);
  return ids;
}

/** The node shown in a diagram's footer: "A-0" for the context diagram. */
export function diagramNode(model: Model, diagramId: DiagramId): string {
  return diagramId === CONTEXT_DIAGRAM ? 'A-0' : nodeNumber(model, diagramId);
}

export function diagramTitle(model: Model, diagramId: DiagramId): string {
  return getFunction(model, diagramId === CONTEXT_DIAGRAM ? model.rootId : diagramId).label;
}

/** Footer number, for example "CC-02": the prefix plus the diagram's position. */
export function diagramNumber(model: Model, diagramId: DiagramId): string {
  const index = diagramIds(model).indexOf(diagramId);
  if (index < 0) throw new DomainError(`Unknown diagram "${diagramId}"`);
  return `${model.info.numberPrefix}-${String(index + 1).padStart(2, '0')}`;
}

export function functionsOn(model: Model, diagramId: DiagramId): FunctionNode[] {
  if (diagramId === CONTEXT_DIAGRAM) return [getFunction(model, model.rootId)];
  return getFunction(model, diagramId).children.map((id) => getFunction(model, id));
}

export function arrowsOn(model: Model, diagramId: DiagramId): Arrow[] {
  return model.arrows.filter((a) => a.diagramId === diagramId);
}

/** Whether an arrow touches a function with the given role. */
export function touches(arrow: Arrow, functionId: FunctionId, role: Role): boolean {
  if (role === 'output') {
    return arrow.sources.some((s) => s.kind === 'function' && s.functionId === functionId);
  }
  return arrow.targets.some(
    (t) => t.kind === 'function' && t.functionId === functionId && t.role === role,
  );
}

/** The arrows on one side of a function's box, in side order. */
export function arrowsAt(model: Model, functionId: FunctionId, role: Role): Arrow[] {
  const diagramId = diagramOfFunction(model, functionId);
  return model.arrows.filter((a) => a.diagramId === diagramId && touches(a, functionId, role));
}

const CODE_LETTER: Record<Role, string> = { input: 'I', control: 'C', output: 'O', mechanism: 'M' };

export function icomCode(role: Role, index: number): string {
  return `${CODE_LETTER[role]}${index + 1}`;
}

export function isParentLink(link: { readonly kind: string }): link is ParentLink {
  return link.kind === 'inherited' || link.kind === 'split';
}

/**
 * The role by which the arrow behind a parent link enters the decomposed
 * function, which is the side a child arrow linked to it comes in from.
 */
export function parentEntryRole(model: Model, diagramId: DiagramId, parentArrowId: ArrowId): EntryRole | undefined {
  const parentArrow = model.arrows.find((a) => a.id === parentArrowId);
  const end = parentArrow?.targets.find((t) => t.kind === 'function' && t.functionId === diagramId);
  return end?.kind === 'function' ? end.role : undefined;
}

/** The side of the diagram an arrow's boundary source enters from, as a role. */
export function boundarySourceRole(model: Model, arrow: Arrow): EntryRole | undefined {
  const source = arrow.sources.find((s) => s.kind === 'boundary');
  if (source?.kind !== 'boundary') return undefined;
  return isParentLink(source.link)
    ? parentEntryRole(model, arrow.diagramId, source.link.parentArrowId)
    : source.link.role;
}

/**
 * One arrow that touches a decomposed function on its parent diagram, seen
 * from the child diagram's boundary.
 */
export interface InheritedBoundaryArrow {
  readonly parentArrowId: ArrowId;
  readonly label: string;
  readonly role: Role;
  readonly code: string;
  /** `unconnected` until a child arrow links to it. */
  readonly state: 'connected' | 'split' | 'unconnected';
  readonly childArrowIds: readonly ArrowId[];
}

/**
 * The boundary arrows a child diagram receives from its parent: every arrow
 * touching the parent function, with its ICOM code and how the child uses it.
 * Empty for the context diagram.
 */
export function inheritedBoundary(model: Model, diagramId: DiagramId): InheritedBoundaryArrow[] {
  if (diagramId === CONTEXT_DIAGRAM) return [];
  const childArrows = arrowsOn(model, diagramId);
  const result: InheritedBoundaryArrow[] = [];
  for (const role of ROLES) {
    arrowsAt(model, diagramId, role).forEach((parentArrow, index) => {
      const linked = childArrows.flatMap((child) => {
        const ends = role === 'output' ? child.targets : child.sources;
        const sameSide = role === 'output' || boundarySourceRole(model, child) === role;
        return ends.flatMap((end) =>
          end.kind === 'boundary' && isParentLink(end.link) && end.link.parentArrowId === parentArrow.id && sameSide
            ? [{ id: child.id, kind: end.link.kind }]
            : [],
        );
      });
      const first = linked[0];
      result.push({
        parentArrowId: parentArrow.id,
        label: parentArrow.label,
        role,
        code: icomCode(role, index),
        state: first === undefined ? 'unconnected' : first.kind === 'split' ? 'split' : 'connected',
        childArrowIds: linked.map((l) => l.id),
      });
    });
  }
  return result;
}

/**
 * The ICOM code shown where an arrow crosses the boundary of its diagram.
 * On the context diagram codes follow the order of the external arrows; on a
 * child diagram they come from the parent box. Tunneled ends have no code.
 */
export function boundaryCode(model: Model, arrow: Arrow, end: 'source' | 'target'): string | undefined {
  const boundaryEnd = (end === 'source' ? arrow.sources : arrow.targets).find((e) => e.kind === 'boundary');
  if (boundaryEnd?.kind !== 'boundary') return undefined;
  const link = boundaryEnd.link;
  const role: Role | undefined = end === 'target' ? 'output' : boundarySourceRole(model, arrow);
  if (role === undefined || link.kind === 'tunneled') return undefined;
  if (isParentLink(link)) {
    const index = arrowsAt(model, arrow.diagramId, role).findIndex((a) => a.id === link.parentArrowId);
    return index < 0 ? undefined : icomCode(role, index);
  }
  const isExternalPeer = (a: Arrow): boolean =>
    end === 'target'
      ? a.targets.some((t) => t.kind === 'boundary' && t.link.kind === 'external')
      : a.sources.some((s) => s.kind === 'boundary' && s.link.kind === 'external') &&
        boundarySourceRole(model, a) === role;
  return icomCode(role, arrowsOn(model, arrow.diagramId).filter(isExternalPeer).indexOf(arrow));
}

export interface GlossaryTerm {
  readonly term: string;
  readonly definition: string;
  /** False when the term has a definition but no function or arrow uses it any more. */
  readonly used: boolean;
}

/** Every function and arrow label with its definition, plus unused definitions. */
export function glossaryTerms(model: Model): GlossaryTerm[] {
  const definitions = new Map(model.glossary.map((e) => [e.term, e.definition]));
  const labels = new Set<string>();
  for (const diagramId of diagramIds(model)) {
    for (const fn of functionsOn(model, diagramId)) labels.add(fn.label);
    for (const arrow of arrowsOn(model, diagramId)) labels.add(arrow.label);
  }
  labels.delete('');
  const used = [...labels].map((term) => ({ term, definition: definitions.get(term) ?? '', used: true }));
  const unused = model.glossary
    .filter((e) => !labels.has(e.term))
    .map((e) => ({ term: e.term, definition: e.definition, used: false }));
  return [...used, ...unused];
}
