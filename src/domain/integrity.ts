/**
 * Structural invariants of a model. These are not IDEF0 style rules (those
 * belong to the validation module); they are what must hold for the model to
 * make sense at all. Every command result is checked against them.
 */
import { DomainError } from './errors';
import {
  CONTEXT_DIAGRAM,
  type Arrow,
  type ArrowSource,
  type ArrowTarget,
  type Model,
} from './model';
import { diagramExists, diagramOfFunction, functionsOn, isParentLink, touches } from './queries';

type Direction = 'source' | 'target';

/** Why one arrow end is invalid, or undefined when it is fine. */
function endProblem(model: Model, arrow: Arrow, end: ArrowSource | ArrowTarget, direction: Direction): string | undefined {
  if (end.kind === 'function') {
    return functionsOn(model, arrow.diagramId).some((f) => f.id === end.functionId)
      ? undefined
      : `function "${end.functionId}" is not on the arrow's diagram`;
  }
  const link = end.link;
  if (arrow.diagramId === CONTEXT_DIAGRAM) {
    return link.kind === 'external' ? undefined : 'a boundary end on the context diagram must be external';
  }
  if (link.kind === 'external') return 'only the context diagram has external boundary ends';
  if (!isParentLink(link)) return undefined;
  const parentArrow = model.arrows.find((a) => a.id === link.parentArrowId);
  if (!parentArrow) return `parent arrow "${link.parentArrowId}" does not exist`;
  if (parentArrow.diagramId !== diagramOfFunction(model, arrow.diagramId)) {
    return `parent arrow "${parentArrow.id}" is not on the parent diagram`;
  }
  const touchesParent =
    direction === 'target'
      ? touches(parentArrow, arrow.diagramId, 'output')
      : parentArrow.targets.some((t) => t.kind === 'function' && t.functionId === arrow.diagramId);
  return touchesParent ? undefined : `parent arrow "${parentArrow.id}" does not touch the decomposed function`;
}

function hasDuplicates(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

function treeProblems(model: Model): string[] {
  const problems: string[] = [];
  if (!model.functions[model.rootId]) return [`root function "${model.rootId}" does not exist`];
  const seen = new Set<string>();
  const visit = (id: string): void => {
    if (seen.has(id)) {
      problems.push(`function "${id}" appears more than once in the tree`);
      return;
    }
    seen.add(id);
    const fn = model.functions[id];
    if (!fn) {
      problems.push(`function "${id}" does not exist`);
      return;
    }
    if (fn.id !== id) problems.push(`function "${id}" is stored under the wrong id`);
    fn.children.forEach(visit);
  };
  visit(model.rootId);
  for (const id of Object.keys(model.functions)) {
    if (!seen.has(id)) problems.push(`function "${id}" is not reachable from the root`);
  }
  return problems;
}

function arrowProblems(model: Model, arrow: Arrow): string[] {
  const problems: string[] = [];
  if (!diagramExists(model, arrow.diagramId)) return [`diagram "${arrow.diagramId}" does not exist`];
  if (arrow.sources.length === 0) problems.push('has no source');
  if (arrow.targets.length === 0) problems.push('has no target');
  const functionEnds = [...arrow.sources, ...arrow.targets].filter((e) => e.kind === 'function');
  if (functionEnds.length === 0) problems.push('touches no function');
  if (arrow.sources.filter((s) => s.kind === 'boundary').length > 1) problems.push('has more than one boundary source');
  if (arrow.targets.filter((t) => t.kind === 'boundary').length > 1) problems.push('has more than one boundary target');
  if (hasDuplicates(arrow.sources.flatMap((s) => (s.kind === 'function' ? [s.functionId] : [])))) {
    problems.push('leaves the same function twice');
  }
  if (hasDuplicates(arrow.targets.flatMap((t) => (t.kind === 'function' ? [`${t.functionId}/${t.role}`] : [])))) {
    problems.push('enters the same function side twice');
  }
  for (const source of arrow.sources) {
    const problem = endProblem(model, arrow, source, 'source');
    if (problem) problems.push(problem);
  }
  for (const target of arrow.targets) {
    const problem = endProblem(model, arrow, target, 'target');
    if (problem) problems.push(problem);
  }
  return problems;
}

/** An inherited parent arrow is one child arrow; only splits may share a parent. */
function linkProblems(model: Model): string[] {
  const groups = new Map<string, { inherited: number; total: number }>();
  for (const arrow of model.arrows) {
    for (const [direction, ends] of [['source', arrow.sources], ['target', arrow.targets]] as const) {
      for (const end of ends) {
        if (end.kind !== 'boundary' || !isParentLink(end.link)) continue;
        const key = `${arrow.diagramId}/${end.link.parentArrowId}/${direction}`;
        const group = groups.get(key) ?? { inherited: 0, total: 0 };
        group.total += 1;
        if (end.link.kind === 'inherited') group.inherited += 1;
        groups.set(key, group);
      }
    }
  }
  return [...groups.entries()]
    .filter(([, g]) => g.inherited > 0 && g.total > 1)
    .map(([key]) => `parent arrow "${key.split('/')[1]}" is inherited more than once on diagram "${key.split('/')[0]}"; branch one arrow or use splits`);
}

/** Every broken invariant, as human-readable text. Empty when the model is sound. */
export function integrityProblems(model: Model): string[] {
  const problems = treeProblems(model);
  if (problems.length > 0) return problems;
  if (hasDuplicates(model.arrows.map((a) => a.id))) problems.push('arrow ids are not unique');
  for (const arrow of model.arrows) {
    problems.push(...arrowProblems(model, arrow).map((p) => `arrow "${arrow.id}" (${arrow.label}): ${p}`));
  }
  problems.push(...linkProblems(model));
  if (hasDuplicates(model.glossary.map((e) => e.term))) problems.push('glossary terms are not unique');
  return problems;
}

export function assertIntegrity(model: Model): Model {
  const problems = integrityProblems(model);
  if (problems.length > 0) throw new DomainError(problems[0]!, problems);
  return model;
}

/**
 * Removes what a deletion left dangling: ends that point at functions or
 * parent arrows that are gone, then arrows left without a source, a target or
 * a function, repeated until nothing changes (a removed parent arrow can
 * orphan arrows further down the tree).
 */
export function pruneDangling(model: Model): Model {
  let current = model;
  for (;;) {
    const arrows = current.arrows.flatMap((arrow) => {
      if (!diagramExists(current, arrow.diagramId)) return [];
      const sources = arrow.sources.filter((s) => !endProblem(current, arrow, s, 'source'));
      const targets = arrow.targets.filter((t) => !endProblem(current, arrow, t, 'target'));
      const touchesFunction = [...sources, ...targets].some((e) => e.kind === 'function');
      if (sources.length === 0 || targets.length === 0 || !touchesFunction) return [];
      const unchanged = sources.length === arrow.sources.length && targets.length === arrow.targets.length;
      return [unchanged ? arrow : { ...arrow, sources, targets }];
    });
    const changed = arrows.length !== current.arrows.length || arrows.some((a, i) => a !== current.arrows[i]);
    if (!changed) return current;
    current = { ...current, arrows };
  }
}
