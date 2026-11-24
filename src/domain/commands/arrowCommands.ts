import { DomainError } from '../errors';
import { newId } from '../ids';
import { pruneDangling } from '../integrity';
import type { Arrow, ArrowId, ArrowSource, ArrowTarget, DiagramId, Model } from '../model';
import { getArrow } from '../queries';
import { defineCommand, moveItem, type Command } from './command';

function replaceArrow(model: Model, arrow: Arrow): Model {
  return { ...model, arrows: model.arrows.map((a) => (a.id === arrow.id ? arrow : a)) };
}

/**
 * Adds an arrow to a diagram. A boundary end must say why it may cross the
 * boundary (inherited, split, tunneled or, on the context diagram, external),
 * which is how splitting and tunneling an arrow are expressed.
 */
export function addArrow(args: {
  diagramId: DiagramId;
  label: string;
  sources: readonly ArrowSource[];
  targets: readonly ArrowTarget[];
  id?: ArrowId;
}): Command {
  const id = args.id ?? newId('a');
  return defineCommand('Add arrow', (model) => ({
    ...model,
    arrows: [...model.arrows, { id, diagramId: args.diagramId, label: args.label, sources: args.sources, targets: args.targets }],
  }));
}

export function renameArrow(args: { id: ArrowId; label: string }): Command {
  return defineCommand('Rename arrow', (model) => replaceArrow(model, { ...getArrow(model, args.id), label: args.label }));
}

/** Deletes an arrow and everything on child diagrams that was linked to it. */
export function deleteArrow(args: { id: ArrowId }): Command {
  return defineCommand('Delete arrow', (model) => {
    getArrow(model, args.id);
    return pruneDangling({ ...model, arrows: model.arrows.filter((a) => a.id !== args.id) });
  });
}

/**
 * Moves an arrow to a new position among the arrows of its own diagram.
 * Arrow order is the order along box sides, so this changes ICOM codes.
 */
export function moveArrow(args: { id: ArrowId; toIndex: number }): Command {
  return defineCommand('Reorder arrow', (model) => {
    const arrow = getArrow(model, args.id);
    const onDiagram = model.arrows.filter((a) => a.diagramId === arrow.diagramId);
    const reordered = moveItem(onDiagram, onDiagram.indexOf(arrow), args.toIndex);
    let next = 0;
    return { ...model, arrows: model.arrows.map((a) => (a.diagramId === arrow.diagramId ? reordered[next++]! : a)) };
  });
}

/** Adds a target to an existing arrow, which makes it branch. */
export function addArrowTarget(args: { id: ArrowId; target: ArrowTarget }): Command {
  return defineCommand('Branch arrow', (model) => {
    const arrow = getArrow(model, args.id);
    return replaceArrow(model, { ...arrow, targets: [...arrow.targets, args.target] });
  });
}

/** Adds a source to an existing arrow, which makes it a join. */
export function addArrowSource(args: { id: ArrowId; source: ArrowSource }): Command {
  return defineCommand('Join arrow', (model) => {
    const arrow = getArrow(model, args.id);
    return replaceArrow(model, { ...arrow, sources: [...arrow.sources, args.source] });
  });
}

function removeEnd(description: string, id: ArrowId, ends: 'sources' | 'targets', index: number): Command {
  return defineCommand(description, (model) => {
    const arrow = getArrow(model, id);
    if (index < 0 || index >= arrow[ends].length) throw new DomainError(`Arrow "${id}" has no ${ends} at ${index}`);
    if (arrow[ends].length === 1) throw new DomainError('An arrow needs a source and a target; delete the arrow instead');
    const remaining = arrow[ends].filter((_, i) => i !== index);
    return pruneDangling(replaceArrow(model, { ...arrow, [ends]: remaining }));
  });
}

export function removeArrowTarget(args: { id: ArrowId; index: number }): Command {
  return removeEnd('Remove arrow target', args.id, 'targets', args.index);
}

export function removeArrowSource(args: { id: ArrowId; index: number }): Command {
  return removeEnd('Remove arrow source', args.id, 'sources', args.index);
}
