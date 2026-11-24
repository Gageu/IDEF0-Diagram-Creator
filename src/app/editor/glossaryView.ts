/**
 * The glossary as the screen lists it: each term with where the model uses
 * it, a filter and a search over the list, and the count that shows how far
 * along the definitions are. Plain logic, tested without a browser.
 */
import { arrowsOn, diagramIds, diagramNode, functionsOn, glossaryTerms, nodeNumber, type ArrowId, type DiagramId, type FunctionId, type GlossaryTerm, type Model } from '../../domain';
import type { GlossaryFilter } from './workspaceState';

/** One function or arrow that carries a term as its name. */
export type GlossaryUse =
  | { readonly kind: 'function'; readonly id: FunctionId; readonly diagramId: DiagramId; readonly node: string }
  | { readonly kind: 'arrow'; readonly id: ArrowId; readonly diagramId: DiagramId; readonly node: string };

export type GlossaryStatus = 'defined' | 'undefined' | 'unused';

export interface GlossaryRow extends GlossaryTerm {
  readonly status: GlossaryStatus;
  /** In diagram order. Empty for an unused term. */
  readonly uses: readonly GlossaryUse[];
}

/** Every term in alphabetical order, with the functions and arrows named by it. */
export function glossaryRows(model: Model): GlossaryRow[] {
  const uses = new Map<string, GlossaryUse[]>();
  const note = (term: string, use: GlossaryUse): void => {
    uses.set(term, [...(uses.get(term) ?? []), use]);
  };
  for (const diagramId of diagramIds(model)) {
    for (const fn of functionsOn(model, diagramId)) note(fn.label, { kind: 'function', id: fn.id, diagramId, node: nodeNumber(model, fn.id) });
    for (const arrow of arrowsOn(model, diagramId)) note(arrow.label, { kind: 'arrow', id: arrow.id, diagramId, node: diagramNode(model, diagramId) });
  }
  return glossaryTerms(model)
    .map((term): GlossaryRow => ({
      ...term,
      status: !term.used ? 'unused' : term.definition.trim() === '' ? 'undefined' : 'defined',
      uses: uses.get(term.term) ?? [],
    }))
    .sort((a, b) => a.term.localeCompare(b.term, undefined, { sensitivity: 'base' }));
}

export interface GlossaryCounts {
  /** Terms the model uses: the ones a finished glossary defines. */
  readonly used: number;
  readonly defined: number;
  readonly undefined: number;
  readonly unused: number;
}

export function glossaryCounts(rows: readonly GlossaryRow[]): GlossaryCounts {
  const count = (status: GlossaryStatus): number => rows.filter((r) => r.status === status).length;
  const [defined, missing, unused] = [count('defined'), count('undefined'), count('unused')];
  return { used: defined + missing, defined, undefined: missing, unused };
}

/** The rows a filter and a search leave. The search looks in terms and in definitions, ignoring case. */
export function filterGlossary(rows: readonly GlossaryRow[], filter: GlossaryFilter, query: string): GlossaryRow[] {
  const needle = query.trim().toLowerCase();
  return rows.filter(
    (row) => (filter === 'all' || row.status === filter) && (needle === '' || row.term.toLowerCase().includes(needle) || row.definition.toLowerCase().includes(needle)),
  );
}

/** The definition stored for a name, or an empty string. */
export function definitionOf(model: Model, term: string): string {
  return model.glossary.find((e) => e.term === term)?.definition ?? '';
}
