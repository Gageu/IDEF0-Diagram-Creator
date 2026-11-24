/**
 * What a right-click offers on each kind of element. A menu is plain data:
 * entries that name an action, which the screen carries out. That keeps the
 * choice of what to offer, and when an entry is unavailable, in one place
 * that is tested without a browser, and lets the same menus serve the
 * diagram and the function tree.
 */
import {
  arrowsOn,
  CONTEXT_DIAGRAM,
  deleteArrow,
  deleteFunction,
  diagramNode,
  diagramOfFunction,
  functionsOn,
  getArrow,
  getFunction,
  inheritedBoundary,
  moveArrow,
  moveFunction,
  parentOf,
  ROLES,
  type ArrowId,
  type Command,
  type DiagramId,
  type FunctionId,
  type Model,
  type Role,
} from '../../domain';
import { connectParentArrow } from './arrowEntry';
import { describeFunction } from './describe';
import type { Selection } from './editorState';
import { addFunctionStep, decomposeStep } from './functionActions';
import type { FocusField } from './workspaceState';

export type MenuAction =
  | { readonly type: 'run'; readonly command: Command; readonly then?: { readonly open?: DiagramId; readonly select?: Selection } }
  | { readonly type: 'open'; readonly diagramId: DiagramId; readonly select?: Selection }
  /** Shows an element in the editor panel with the cursor in one of its fields. */
  | { readonly type: 'edit'; readonly diagramId: DiagramId; readonly selection: Selection; readonly field: FocusField }
  | { readonly type: 'fit' }
  | { readonly type: 'export'; readonly exporterId: string };

export type MenuEntry =
  | { readonly kind: 'item'; readonly label: string; readonly action: MenuAction; readonly shortcut?: string; readonly disabled?: boolean; readonly danger?: boolean }
  | { readonly kind: 'heading'; readonly label: string }
  | { readonly kind: 'separator' };

const SEPARATOR: MenuEntry = { kind: 'separator' };

function item(label: string, action: MenuAction, options: { shortcut?: string; disabled?: boolean; danger?: boolean } = {}): MenuEntry {
  return { kind: 'item', label, action, ...options };
}

const ROLE_ITEM: Record<Role, { label: string; shortcut: string }> = {
  input: { label: 'Input…', shortcut: 'I' },
  control: { label: 'Control…', shortcut: 'C' },
  output: { label: 'Output…', shortcut: 'O' },
  mechanism: { label: 'Mechanism…', shortcut: 'M' },
};

/** A function, on its box or on its row in the tree. */
export function functionMenu(model: Model, functionId: FunctionId): MenuEntry[] {
  const fn = getFunction(model, functionId);
  const diagramId = diagramOfFunction(model, functionId);
  const selection: Selection = { kind: 'function', id: functionId };
  const parentId = parentOf(model, functionId);
  const siblings = parentId === undefined ? [] : getFunction(model, parentId).children;
  const index = siblings.indexOf(functionId);
  const decompose = decomposeStep(model, functionId);
  return [
    decompose
      ? item('Decompose', { type: 'run', ...decompose })
      : item('Open diagram', { type: 'open', diagramId: functionId }),
    item('Rename', { type: 'edit', diagramId, selection, field: 'label' }, { shortcut: 'F2' }),
    item('Define in glossary', { type: 'edit', diagramId, selection, field: 'definition' }, { disabled: fn.label.trim() === '' }),
    SEPARATOR,
    { kind: 'heading', label: 'Add arrow' },
    ...ROLES.map((role) => item(ROLE_ITEM[role].label, { type: 'edit', diagramId, selection, field: role }, { shortcut: ROLE_ITEM[role].shortcut })),
    SEPARATOR,
    item('Move earlier', { type: 'run', command: moveFunction({ id: functionId, toIndex: index - 1 }) }, { disabled: index <= 0 }),
    item('Move later', { type: 'run', command: moveFunction({ id: functionId, toIndex: index + 1 }) }, { disabled: index < 0 || index >= siblings.length - 1 }),
    SEPARATOR,
    item('Delete', { type: 'run', command: deleteFunction({ id: functionId }) }, { shortcut: 'Del', danger: true, disabled: parentId === undefined }),
  ];
}

/** An arrow that belongs to the open diagram. */
export function arrowMenu(model: Model, arrowId: ArrowId): MenuEntry[] {
  const arrow = getArrow(model, arrowId);
  const onDiagram = arrowsOn(model, arrow.diagramId);
  const index = onDiagram.indexOf(arrow);
  const selection: Selection = { kind: 'arrow', id: arrowId };
  return [
    item('Rename', { type: 'edit', diagramId: arrow.diagramId, selection, field: 'label' }, { shortcut: 'F2' }),
    item('Define in glossary', { type: 'edit', diagramId: arrow.diagramId, selection, field: 'definition' }, { disabled: arrow.label.trim() === '' }),
    SEPARATOR,
    item('Move earlier', { type: 'run', command: moveArrow({ id: arrowId, toIndex: index - 1 }) }, { disabled: index <= 0 }),
    item('Move later', { type: 'run', command: moveArrow({ id: arrowId, toIndex: index + 1 }) }, { disabled: index >= onDiagram.length - 1 }),
    SEPARATOR,
    item('Delete', { type: 'run', command: deleteArrow({ id: arrowId }) }, { shortcut: 'Del', danger: true }),
  ];
}

/** An arrow of the parent diagram, seen from the child: connect it here, or go and look at it. */
export function parentArrowMenu(model: Model, diagramId: DiagramId, parentArrowId: ArrowId): MenuEntry[] {
  const parent = inheritedBoundary(model, diagramId).find((p) => p.parentArrowId === parentArrowId);
  if (!parent || diagramId === CONTEXT_DIAGRAM) return [];
  const connect: MenuEntry[] =
    parent.state === 'unconnected'
      ? [
          { kind: 'heading', label: `Connect ${parent.code} to` },
          ...functionsOn(model, diagramId).flatMap((fn) => {
            const plan = connectParentArrow(model, diagramId, parentArrowId, fn.id);
            return plan.kind === 'invalid' ? [] : [item(describeFunction(model, fn.id), { type: 'run', command: plan.command })];
          }),
          SEPARATOR,
        ]
      : [];
  return [...connect, item('Show on the parent diagram', { type: 'open', diagramId: diagramOfFunction(model, diagramId), select: { kind: 'arrow', id: parentArrowId } })];
}

/** The empty part of a diagram. */
export function diagramMenu(model: Model, diagramId: DiagramId): MenuEntry[] {
  const up: MenuEntry[] =
    diagramId === CONTEXT_DIAGRAM
      ? []
      : [item(`Go up to ${diagramNode(model, diagramOfFunction(model, diagramId))}`, { type: 'open', diagramId: diagramOfFunction(model, diagramId), select: { kind: 'function', id: diagramId } })];
  return [
    item('Add function', { type: 'run', ...addFunctionStep(model, diagramId) }, { shortcut: 'F' }),
    SEPARATOR,
    item('Fit to window', { type: 'fit' }),
    ...up,
    SEPARATOR,
    item('Export this diagram as SVG', { type: 'export', exporterId: 'svg-current' }),
  ];
}

/** The menu for whatever was right-clicked on a diagram. */
export function menuFor(model: Model, diagramId: DiagramId, target: Selection): MenuEntry[] {
  if (target.kind === 'function') return functionMenu(model, target.id);
  if (target.kind === 'arrow') return arrowMenu(model, target.id);
  if (target.kind === 'parent-arrow') return parentArrowMenu(model, diagramId, target.id);
  return diagramMenu(model, diagramId);
}
