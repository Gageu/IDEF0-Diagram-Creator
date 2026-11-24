/**
 * The function tree as the rows a screen shows: which functions are visible
 * given what is expanded, and where an arrow key moves from a row. Plain
 * logic with no UI in it, so it is tested without a browser.
 */
import { CONTEXT_DIAGRAM, diagramIds, getFunction, nodeNumber, parentOf, type DiagramId, type FunctionId, type Model } from '../../domain';

export type Expanded = ReadonlySet<FunctionId>;

export interface TreeRow {
  /** A function, or the context diagram, which sits above the tree as its own row. */
  readonly id: DiagramId;
  readonly depth: number;
  readonly number: string;
  readonly label: string;
  /** Whether the function has a child diagram, and so a branch to open or close. */
  readonly decomposed: boolean;
  readonly expanded: boolean;
}

/** The rows in view, top to bottom: the context diagram, then every function whose ancestors are all expanded. */
export function treeRows(model: Model, expanded: Expanded): TreeRow[] {
  const rows: TreeRow[] = [{ id: CONTEXT_DIAGRAM, depth: 0, number: 'A-0', label: 'Context diagram', decomposed: false, expanded: false }];
  const visit = (id: FunctionId, depth: number): void => {
    const fn = getFunction(model, id);
    const decomposed = fn.children.length > 0;
    const open = decomposed && expanded.has(id);
    rows.push({ id, depth, number: nodeNumber(model, id), label: fn.label, decomposed, expanded: open });
    if (open) fn.children.forEach((child) => visit(child, depth + 1));
  };
  visit(model.rootId, 0);
  return rows;
}

/** Every function that has a branch to expand. */
export function expandableIds(model: Model): FunctionId[] {
  return diagramIds(model).filter((id) => id !== CONTEXT_DIAGRAM);
}

/** The functions above `id`, nearest last. Empty for the root. */
export function ancestors(model: Model, id: FunctionId): FunctionId[] {
  const path: FunctionId[] = [];
  let current = model.functions[id] ? parentOf(model, id) : undefined;
  while (current !== undefined) {
    path.unshift(current);
    current = parentOf(model, current);
  }
  return path;
}

/** What must be expanded for a diagram's boxes to show in the tree: the decomposed function and everything above it. */
export function branchOf(model: Model, diagramId: DiagramId): FunctionId[] {
  if (diagramId === CONTEXT_DIAGRAM || !model.functions[diagramId]) return [];
  return [...ancestors(model, diagramId), diagramId];
}

export type TreeMove =
  | { readonly kind: 'focus'; readonly id: DiagramId }
  | { readonly kind: 'expand' | 'collapse'; readonly id: FunctionId };

/**
 * Where a key takes the user from one row, following the usual tree
 * conventions: up and down step through the visible rows, right opens a
 * branch and then steps into it, left closes a branch and then steps out.
 */
export function treeMove(model: Model, rows: readonly TreeRow[], id: DiagramId, key: string): TreeMove | undefined {
  const index = rows.findIndex((r) => r.id === id);
  const row = rows[index];
  if (!row) return undefined;
  const focus = (target: TreeRow | undefined): TreeMove | undefined => (target && target !== row ? { kind: 'focus', id: target.id } : undefined);
  switch (key) {
    case 'ArrowDown':
      return focus(rows[index + 1]);
    case 'ArrowUp':
      return focus(rows[index - 1]);
    case 'Home':
      return focus(rows[0]);
    case 'End':
      return focus(rows[rows.length - 1]);
    case 'ArrowRight':
      if (!row.decomposed) return undefined;
      return row.expanded ? focus(rows[index + 1]) : { kind: 'expand', id: row.id };
    case 'ArrowLeft': {
      if (row.expanded) return { kind: 'collapse', id: row.id };
      const parent = row.id === CONTEXT_DIAGRAM ? undefined : parentOf(model, row.id);
      return parent === undefined ? undefined : { kind: 'focus', id: parent };
    }
    default:
      return undefined;
  }
}
