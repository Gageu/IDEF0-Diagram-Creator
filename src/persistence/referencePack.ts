/**
 * Imports the diagram-by-diagram JSON shape of the reference pack
 * (`examples/podcast_model.json`) into the domain model.
 *
 * The pack repeats each boundary arrow on every diagram and stores node
 * numbers and ICOM codes. The model stores none of that: the importer links
 * each child boundary arrow to its parent arrow and orders arrows so the
 * derived ICOM codes equal the ones written in the pack.
 */
import {
  addArrow,
  addFunction,
  arrowsOn,
  assertIntegrity,
  CONTEXT_DIAGRAM,
  createModel,
  diagramOfFunction,
  touches,
  type ArrowId,
  type ArrowSource,
  type ArrowTarget,
  type DiagramId,
  type EntryRole,
  type Model,
  type ParentLink,
  type Role,
} from '../domain';
import { ModelFileError } from './modelFile';

interface PackArrow {
  label: string;
  role: Role;
  icom?: string;
  from?: string;
  to?: string | string[];
  unbundles?: { label: string; to: string }[];
  joins_into?: string;
  bundle_of?: string[];
}

interface PackDiagram {
  node: string;
  number?: string;
  parent_box?: string;
  boxes: { id: string; label: string }[];
  arrows: PackArrow[];
}

interface Pack {
  model?: { name?: string; purpose?: string; viewpoint?: string; context?: string };
  diagrams: PackDiagram[];
}

const ROLE_BY_LETTER: Record<string, Role> = { I: 'input', C: 'control', O: 'output', M: 'mechanism' };

function entryRole(role: Role): EntryRole {
  return role === 'output' ? 'input' : role;
}

export function importReferencePack(text: string): Model {
  const pack = JSON.parse(text) as Pack;
  const [contextDiagram, ...childDiagrams] = pack.diagrams ?? [];
  const rootBox = contextDiagram?.boxes[0];
  if (!contextDiagram || !rootBox || contextDiagram.parent_box !== undefined) {
    throw new ModelFileError('The first diagram must be the A-0 context diagram with one box');
  }

  let model = createModel({
    rootId: rootBox.id,
    rootLabel: rootBox.label,
    info: {
      name: pack.model?.name ?? rootBox.label,
      purpose: pack.model?.purpose ?? '',
      viewpoint: pack.model?.viewpoint ?? '',
      context: pack.model?.context ?? '',
      numberPrefix: contextDiagram.number?.split('-')[0] ?? 'D',
    },
  });

  for (const diagram of childDiagrams) {
    if (diagram.parent_box === undefined) throw new ModelFileError(`Diagram ${diagram.node} has no parent_box`);
    for (const box of diagram.boxes) {
      model = addFunction({ parentId: diagram.parent_box, label: box.label, id: box.id }).apply(model);
    }
  }

  let arrowCount = 0;
  /** Parent arrow ids in the ICOM order the pack states, per child diagram side. */
  const statedOrder = new Map<string, { code: number; arrowId: ArrowId }[]>();

  for (const diagram of pack.diagrams) {
    const diagramId: DiagramId = diagram.parent_box ?? CONTEXT_DIAGRAM;

    /**
     * Finds the parent arrow a boundary arrow carries in: the one with the
     * same name, or failing that the only arrow on that side of the parent
     * box that no arrow on this diagram names. The second case is a renamed
     * arrow, which the model records as a split.
     */
    const parentLink = (label: string, kind: ParentLink['kind'], icom: string | undefined, role: Role): ParentLink => {
      const parentArrows = arrowsOn(model, diagramOfFunction(model, diagramId));
      let parentArrow = parentArrows.find((a) => a.label === label);
      if (!parentArrow) {
        const named = new Set(diagram.arrows.flatMap((a) => [a.label, a.joins_into]));
        const unclaimed = parentArrows.filter((a) => touches(a, diagramId, role) && !named.has(a.label));
        if (unclaimed.length !== 1) {
          throw new ModelFileError(`Diagram ${diagram.node}: boundary arrow "${label}" matches no arrow on the parent diagram`);
        }
        parentArrow = unclaimed[0]!;
        kind = 'split';
      }
      const match = icom?.match(/^([ICOM])(\d+)$/);
      if (match) {
        const key = `${diagramId}/${ROLE_BY_LETTER[match[1]!]}`;
        const list = statedOrder.get(key) ?? [];
        if (!list.some((e) => e.arrowId === parentArrow.id)) list.push({ code: Number(match[2]), arrowId: parentArrow.id });
        statedOrder.set(key, list);
      }
      return { kind, parentArrowId: parentArrow.id };
    };

    const add = (label: string, sources: ArrowSource[], targets: ArrowTarget[]): void => {
      arrowCount += 1;
      model = addArrow({ id: `a${arrowCount}`, diagramId, label, sources, targets }).apply(model);
    };

    const boundarySource = (arrow: PackArrow, kind: ParentLink['kind']): ArrowSource =>
      diagramId === CONTEXT_DIAGRAM
        ? { kind: 'boundary', link: { kind: 'external', role: entryRole(arrow.role) } }
        : { kind: 'boundary', link: parentLink(arrow.label, kind, arrow.icom, arrow.role) };

    for (const arrow of diagram.arrows) {
      if (arrow.bundle_of) continue; // Represented by the split links of its member arrows.

      if (arrow.unbundles) {
        for (const member of arrow.unbundles) {
          add(member.label, [boundarySource(arrow, 'split')], [
            { kind: 'function', functionId: member.to, role: entryRole(arrow.role) },
          ]);
        }
        continue;
      }

      if (arrow.joins_into !== undefined) {
        const joined = diagram.arrows.find((a) => a.label === arrow.joins_into);
        add(arrow.label, [{ kind: 'function', functionId: arrow.from! }], [
          { kind: 'boundary', link: parentLink(arrow.joins_into, 'split', joined?.icom, 'output') },
        ]);
        continue;
      }

      const sources: ArrowSource[] =
        arrow.from === 'boundary' ? [boundarySource(arrow, 'inherited')] : [{ kind: 'function', functionId: arrow.from! }];
      const targets: ArrowTarget[] = (Array.isArray(arrow.to) ? arrow.to : [arrow.to!]).map((to) =>
        to !== 'boundary'
          ? { kind: 'function', functionId: to, role: entryRole(arrow.role) }
          : diagramId === CONTEXT_DIAGRAM
            ? { kind: 'boundary', link: { kind: 'external' } }
            : { kind: 'boundary', link: parentLink(arrow.label, 'inherited', arrow.icom, 'output') },
      );
      add(arrow.label, sources, targets);
    }
  }

  return assertIntegrity(applyStatedOrder(model, statedOrder));
}

/**
 * Permutes parent arrows among the positions they already occupy so that the
 * order along each decomposed box side matches the pack's ICOM codes.
 */
function applyStatedOrder(model: Model, statedOrder: Map<string, { code: number; arrowId: ArrowId }[]>): Model {
  const arrows = [...model.arrows];
  for (const list of statedOrder.values()) {
    const wanted = [...list].sort((a, b) => a.code - b.code).map((e) => arrows.find((a) => a.id === e.arrowId)!);
    const positions = wanted.map((a) => arrows.indexOf(a)).sort((a, b) => a - b);
    positions.forEach((position, i) => {
      arrows[position] = wanted[i]!;
    });
  }
  return { ...model, arrows };
}
