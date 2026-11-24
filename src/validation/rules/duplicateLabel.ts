import { arrowsOn, diagramIds } from '../../domain';
import type { Rule } from '../rule';

/** B7: two different arrows on one diagram do not share a label. One arrow with several ends is a branch, not a duplicate. */
export const duplicateLabel: Rule = {
  id: 'B7',
  title: 'Arrow labels are unique on a diagram',
  severity: 'warning',
  check: (model) =>
    diagramIds(model).flatMap((diagramId) => {
      const seen = new Set<string>();
      return arrowsOn(model, diagramId).flatMap((arrow) => {
        const key = arrow.label.trim().toLowerCase();
        if (key === '') return [];
        if (!seen.has(key)) {
          seen.add(key);
          return [];
        }
        return [{
          diagramId,
          subject: { kind: 'arrow' as const, arrowId: arrow.id },
          message: `Another arrow on this diagram is also labelled "${arrow.label}"; branch one arrow instead`,
        }];
      });
    }),
};
