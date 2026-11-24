/**
 * What a drag on the diagram means. Two drags make arrows: a parent arrow
 * dragged from the sidebar onto a box, and a pull from one box's handle to
 * another box or to empty space. This module decides which box and which
 * side a point is a drop on, and what a drop does to the model. The screen
 * only tracks the pointer and draws the feedback.
 */
import { getArrow, inheritedBoundary, touches, type ArrowSource, type ArrowTarget, type DiagramId, type EntryRole, type FunctionId, type Model } from '../../domain';
import type { Point, Rect } from '../../geometry/geometry';
import { connectParentArrow, planArrowEntry, type EndChoice, type EntryPlan } from './arrowEntry';

export interface DropBox {
  readonly id: FunctionId;
  readonly rect: Rect;
}

/** The box a point is on, or within `margin` of. The nearest centre wins where two boxes' margins overlap. */
export function boxAt(boxes: readonly DropBox[], point: Point, margin = 0): DropBox | undefined {
  const centreDistance = (b: DropBox): number => Math.hypot(point.x - (b.rect.x + b.rect.width / 2), point.y - (b.rect.y + b.rect.height / 2));
  return boxes
    .filter(({ rect }) => point.x >= rect.x - margin && point.x <= rect.x + rect.width + margin && point.y >= rect.y - margin && point.y <= rect.y + rect.height + margin)
    .sort((a, b) => centreDistance(a) - centreDistance(b))[0];
}

/**
 * The role an arrow dropped at a point of a box enters it by: the side it
 * lands nearest, as IDEF0 fixes them. Inputs enter on the left, controls on
 * top, mechanisms from below. The right side is where outputs leave, so it
 * is never a way in.
 */
export function dropRole(rect: Rect, point: Point): EntryRole {
  const toLeft = point.x - rect.x;
  const toTop = point.y - rect.y;
  const toBottom = rect.y + rect.height - point.y;
  if (toLeft <= toTop && toLeft <= toBottom) return 'input';
  return toTop <= toBottom ? 'control' : 'mechanism';
}

/**
 * The choice a new connection starts on, from where the pull ended: the
 * function and side it was dropped on, or, on empty space, the first way
 * across the boundary. Undefined when the drop offers nothing.
 */
export function droppedChoice<End extends ArrowSource | ArrowTarget>(choices: readonly EndChoice<End>[], drop: { functionId: FunctionId; role: EntryRole } | undefined): EndChoice<End> | undefined {
  if (!drop) return choices.find((c) => c.end.kind === 'boundary');
  const onFunction = choices.filter((c) => c.end.kind === 'function' && c.end.functionId === drop.functionId);
  return onFunction.find((c) => c.end.kind === 'function' && 'role' in c.end && c.end.role === drop.role) ?? onFunction[0];
}

/**
 * What dropping a parent arrow on a function does. The arrow's role is fixed
 * by the side of the parent box it touches, so the drop only chooses the
 * function. An unconnected arrow is carried into the diagram there; one that
 * is already connected gains this function as a further end.
 */
export function dropParentArrow(model: Model, diagramId: DiagramId, parentArrowId: string, functionId: FunctionId): EntryPlan {
  const parent = inheritedBoundary(model, diagramId).find((p) => p.parentArrowId === parentArrowId);
  if (!parent) return { kind: 'invalid', reason: 'That arrow does not touch this diagram\'s parent box' };
  if (parent.state === 'unconnected') return connectParentArrow(model, diagramId, parentArrowId, functionId);
  if (parent.state === 'split') return { kind: 'invalid', reason: `"${parent.label}" is split into parts on this diagram. Add another part from the function's ${parent.role} row` };
  const child = getArrow(model, parent.childArrowIds[0]!);
  if (touches(child, functionId, parent.role)) return { kind: 'invalid', reason: `"${child.label}" is already ${parent.role === 'mechanism' || parent.role === 'control' ? 'a' : 'an'} ${parent.role} of this function` };
  return planArrowEntry(model, { functionId, role: parent.role, label: child.label, other: undefined });
}
