import { diagramIds, functionsOn, nodeNumber } from '../../domain';
import type { Rule } from '../rule';

const NOT_VERBS = new Set(['the', 'a', 'an', 'of', 'for', 'to', 'and', 'in', 'on', 'with']);

/**
 * Whether a function label reads as a verb phrase: a verb followed by its
 * object, as in "Analyze Change Impact". Without a dictionary this is a
 * heuristic, which is why the rule is only a warning: it flags one-word
 * labels and labels that open with an article or a preposition. Word endings
 * are no guide ("Implement" and "Version" are verbs here), so it does not
 * guess at nouns.
 */
export function looksLikeVerbPhrase(label: string): boolean {
  const words = label.trim().split(/\s+/).filter(Boolean);
  const first = words[0];
  if (first === undefined || words.length < 2) return false;
  return !NOT_VERBS.has(first.toLowerCase());
}

/** B1: a function is named with an active verb phrase. */
export const verbPhrase: Rule = {
  id: 'B1',
  title: 'Function names are verb phrases',
  severity: 'warning',
  check: (model) =>
    diagramIds(model).flatMap((diagramId) =>
      functionsOn(model, diagramId)
        .filter((fn) => fn.label.trim() !== '' && !looksLikeVerbPhrase(fn.label))
        .map((fn) => ({
          diagramId,
          subject: { kind: 'function' as const, functionId: fn.id },
          message: `${nodeNumber(model, fn.id)} "${fn.label}" should be a verb and its object, such as "Review Request"`,
        })),
    ),
};
