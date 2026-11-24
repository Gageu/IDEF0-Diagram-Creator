/**
 * Turns what the user enters in an "add arrow" row into one domain command.
 * The row asks for a label and the other end; this module lists the other
 * ends the model allows and decides whether the entry is a new arrow or
 * another end on an arrow that is already there. It is plain logic with no
 * UI in it, so it is tested without a browser.
 */
import {
  addArrow,
  addArrowSource,
  addArrowTarget,
  deleteArrow,
  removeArrowSource,
  removeArrowTarget,
  arrowsOn,
  CONTEXT_DIAGRAM,
  diagramOfFunction,
  functionsOn,
  inheritedBoundary,
  nodeNumber,
  touches,
  type Arrow,
  type ArrowSource,
  type ArrowTarget,
  type Command,
  type DiagramId,
  type EntryRole,
  type FunctionId,
  type Model,
  type Role,
} from '../../domain';

export const ENTRY_ROLES: readonly EntryRole[] = ['input', 'control', 'mechanism'];

/** One thing an arrow can start from or end at, as a choice in a dropdown. */
export interface EndChoice<End> {
  /** Stable text that identifies the choice among its siblings. */
  readonly key: string;
  readonly text: string;
  readonly group: 'Functions' | 'Boundary';
  readonly end: End;
  /** The label a new arrow takes when the user leaves it blank: the parent arrow's own. */
  readonly defaultLabel?: string;
}

/** The parent arrows of one role that a new boundary end on this diagram may link to. */
function parentChoices(model: Model, diagramId: DiagramId, role: Role): { key: string; text: string; link: { kind: 'inherited' | 'split'; parentArrowId: string }; defaultLabel?: string }[] {
  return inheritedBoundary(model, diagramId)
    .filter((parent) => parent.role === role)
    .flatMap((parent) => [
      // A parent arrow is carried in whole once; after that it can only be split further.
      ...(parent.state === 'unconnected'
        ? [{ key: `inherit:${parent.parentArrowId}`, text: `${parent.code} ${parent.label}`, link: { kind: 'inherited' as const, parentArrowId: parent.parentArrowId }, defaultLabel: parent.label }]
        : []),
      ...(parent.state !== 'connected'
        ? [{ key: `split:${parent.parentArrowId}`, text: `Part of ${parent.code} ${parent.label}`, link: { kind: 'split' as const, parentArrowId: parent.parentArrowId } }]
        : []),
    ]);
}

/** Where an arrow that enters a function by `role` can come from. Unconnected parent arrows come first. */
export function sourceChoices(model: Model, diagramId: DiagramId, role: EntryRole): EndChoice<ArrowSource>[] {
  const boundary: EndChoice<ArrowSource>[] =
    diagramId === CONTEXT_DIAGRAM
      ? [{ key: 'external', text: 'Outside the model', group: 'Boundary', end: { kind: 'boundary', link: { kind: 'external', role } } }]
      : [
          ...parentChoices(model, diagramId, role).map((c): EndChoice<ArrowSource> => ({
            key: c.key,
            text: c.text,
            group: 'Boundary',
            end: { kind: 'boundary', link: c.link },
            ...(c.defaultLabel === undefined ? {} : { defaultLabel: c.defaultLabel }),
          })),
          { key: 'tunneled', text: 'Tunneled (not on the parent)', group: 'Boundary', end: { kind: 'boundary', link: { kind: 'tunneled', role } } },
        ];
  const functions = functionsOn(model, diagramId).map((fn): EndChoice<ArrowSource> => ({
    key: `function:${fn.id}`,
    text: `${nodeNumber(model, fn.id)} ${fn.label}`,
    group: 'Functions',
    end: { kind: 'function', functionId: fn.id },
  }));
  const inheritable = boundary.filter((c) => c.defaultLabel !== undefined);
  return [...inheritable, ...functions, ...boundary.filter((c) => c.defaultLabel === undefined)];
}

/** Where an arrow that leaves a function can go. */
export function targetChoices(model: Model, diagramId: DiagramId): EndChoice<ArrowTarget>[] {
  const boundary: EndChoice<ArrowTarget>[] =
    diagramId === CONTEXT_DIAGRAM
      ? [{ key: 'external', text: 'Outside the model', group: 'Boundary', end: { kind: 'boundary', link: { kind: 'external' } } }]
      : [
          ...parentChoices(model, diagramId, 'output').map((c): EndChoice<ArrowTarget> => ({
            key: c.key,
            text: c.text,
            group: 'Boundary',
            end: { kind: 'boundary', link: c.link },
            ...(c.defaultLabel === undefined ? {} : { defaultLabel: c.defaultLabel }),
          })),
          { key: 'tunneled', text: 'Tunneled (not on the parent)', group: 'Boundary', end: { kind: 'boundary', link: { kind: 'tunneled' } } },
        ];
  const functions = functionsOn(model, diagramId).flatMap((fn) =>
    ENTRY_ROLES.map((role): EndChoice<ArrowTarget> => ({
      key: `function:${fn.id}:${role}`,
      text: `${nodeNumber(model, fn.id)} ${fn.label}, as ${role}`,
      group: 'Functions',
      end: { kind: 'function', functionId: fn.id, role },
    })),
  );
  const inheritable = boundary.filter((c) => c.defaultLabel !== undefined);
  return [...inheritable, ...functions, ...boundary.filter((c) => c.defaultLabel === undefined)];
}

/**
 * One place an arrow can go: a function, or a way across the boundary. A
 * function holds one choice for each role the arrow may still enter it by, so
 * the screen asks "to where" and "as what" as two questions instead of listing
 * every pairing. A boundary holds its single choice.
 */
export interface TargetPlace<End> {
  readonly key: string;
  readonly text: string;
  readonly group: EndChoice<End>['group'];
  readonly choices: readonly EndChoice<End>[];
}

/** The role a choice enters its function by, when it is a function end with a role. */
export function entryRoleOf(choice: EndChoice<ArrowSource | ArrowTarget>): EntryRole | undefined {
  return choice.end.kind === 'function' && 'role' in choice.end ? choice.end.role : undefined;
}

/** Groups choices by where they lead, keeping their order. */
export function targetPlaces<End extends ArrowSource | ArrowTarget>(model: Model, choices: readonly EndChoice<End>[]): TargetPlace<End>[] {
  const places: TargetPlace<End>[] = [];
  for (const choice of choices) {
    const { end } = choice;
    const key = end.kind === 'function' ? `function:${end.functionId}` : choice.key;
    const place = places.find((p) => p.key === key);
    if (place) places[places.indexOf(place)] = { ...place, choices: [...place.choices, choice] };
    else places.push({ key, group: choice.group, choices: [choice], text: end.kind === 'function' ? `${nodeNumber(model, end.functionId)} ${model.functions[end.functionId]?.label ?? ''}` : choice.text });
  }
  return places;
}

/**
 * The choice to hold after the user picks another place: the same role as
 * before where that place offers it, so that changing only "to" leaves "as"
 * alone, and otherwise the place's first.
 */
export function choiceAt<End extends ArrowSource | ArrowTarget>(place: TargetPlace<End>, previous: EndChoice<End> | undefined): EndChoice<End> {
  const role = previous ? entryRoleOf(previous) : undefined;
  return place.choices.find((c) => role !== undefined && entryRoleOf(c) === role) ?? place.choices[0]!;
}

/** The other ends offered in the add row of one side of one function. */
export function otherEndChoices(model: Model, functionId: FunctionId, role: Role): EndChoice<ArrowSource | ArrowTarget>[] {
  const diagramId = diagramOfFunction(model, functionId);
  if (role === 'output') return targetChoices(model, diagramId).filter((c) => !(c.end.kind === 'function' && c.end.functionId === functionId));
  return sourceChoices(model, diagramId, role).filter((c) => !(c.end.kind === 'function' && c.end.functionId === functionId));
}

export interface ArrowEntry {
  readonly functionId: FunctionId;
  readonly role: Role;
  readonly label: string;
  readonly other: EndChoice<ArrowSource | ArrowTarget> | undefined;
}

/** What an entry will do, in words for the user, and the command that does it. */
export type EntryPlan =
  | { readonly kind: 'invalid'; readonly reason: string }
  | { readonly kind: 'new' | 'branch' | 'join'; readonly description: string; readonly command: Command };

const sameLabel = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The other end of an arrow that enters the function is where it comes from; on the output side it is where it goes. */
function isSource(end: ArrowSource | ArrowTarget, role: Role): end is ArrowSource {
  return role !== 'output';
}

/**
 * Decides what an add-row entry means.
 * - A label no arrow on the diagram has: a new arrow between the function and the other end.
 * - The label of an existing arrow: that arrow gains an end instead, because two
 *   arrows with one name on a diagram would be a duplicate (rule B7). On an
 *   entry side the arrow branches to this function. On the output side it
 *   gains the chosen target, or this function as a further source if it does
 *   not leave this function yet.
 */
export function planArrowEntry(model: Model, entry: ArrowEntry): EntryPlan {
  const { functionId, role, other } = entry;
  const diagramId = diagramOfFunction(model, functionId);
  const label = entry.label.trim() === '' ? (other?.defaultLabel ?? '') : entry.label.trim();
  if (label === '') return { kind: 'invalid', reason: 'Type a label' };

  const existing: Arrow | undefined = arrowsOn(model, diagramId).find((a) => sameLabel(a.label, label));
  if (existing) {
    if (role !== 'output') {
      if (touches(existing, functionId, role)) return { kind: 'invalid', reason: `"${existing.label}" is already a ${role} of this function` };
      return {
        kind: 'branch',
        description: `Branches the existing arrow "${existing.label}" to this function`,
        command: addArrowTarget({ id: existing.id, target: { kind: 'function', functionId, role } }),
      };
    }
    if (!touches(existing, functionId, 'output')) {
      return {
        kind: 'join',
        description: `Adds this function as another source of "${existing.label}"`,
        command: addArrowSource({ id: existing.id, source: { kind: 'function', functionId } }),
      };
    }
    if (!other || isSource(other.end, role)) return { kind: 'invalid', reason: 'Choose where the arrow goes' };
    return {
      kind: 'branch',
      description: `Branches the existing arrow "${existing.label}" to ${other.text}`,
      command: addArrowTarget({ id: existing.id, target: other.end }),
    };
  }

  if (!other) return { kind: 'invalid', reason: role === 'output' ? 'Choose where the arrow goes' : 'Choose where the arrow comes from' };
  const command = isSource(other.end, role)
    ? addArrow({ diagramId, label, sources: [other.end], targets: [{ kind: 'function', functionId, role: role as EntryRole }] })
    : addArrow({ diagramId, label, sources: [{ kind: 'function', functionId }], targets: [other.end] });
  return { kind: 'new', description: `Adds the arrow "${label}"`, command };
}

/**
 * Takes an arrow off one side of a function. The arrow keeps its other ends;
 * if this was its only source or only target, the whole arrow goes.
 */
export function detachArrow(arrow: Arrow, functionId: FunctionId, role: Role): Command {
  if (role === 'output') {
    const index = arrow.sources.findIndex((s) => s.kind === 'function' && s.functionId === functionId);
    return arrow.sources.length > 1 ? removeArrowSource({ id: arrow.id, index }) : deleteArrow({ id: arrow.id });
  }
  const index = arrow.targets.findIndex((t) => t.kind === 'function' && t.functionId === functionId && t.role === role);
  return arrow.targets.length > 1 ? removeArrowTarget({ id: arrow.id, index }) : deleteArrow({ id: arrow.id });
}

/** Connects an unconnected parent arrow to one function on the child diagram, under the parent's label. */
export function connectParentArrow(model: Model, diagramId: DiagramId, parentArrowId: string, functionId: FunctionId): EntryPlan {
  const parent = inheritedBoundary(model, diagramId).find((p) => p.parentArrowId === parentArrowId);
  if (!parent) return { kind: 'invalid', reason: 'That arrow does not touch this diagram\'s parent box' };
  const other = otherEndChoices(model, functionId, parent.role).find((c) => c.key === `inherit:${parentArrowId}`);
  if (!other) return { kind: 'invalid', reason: `"${parent.label}" is already connected on this diagram` };
  return planArrowEntry(model, { functionId, role: parent.role, label: '', other });
}
