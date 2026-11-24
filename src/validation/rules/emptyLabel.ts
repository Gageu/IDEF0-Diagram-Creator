import { arrowsOn, diagramIds, functionsOn, nodeNumber } from '../../domain';
import type { Rule } from '../rule';

/** Every box and every arrow carries a name. */
export const emptyLabel: Rule = {
  id: 'LABEL',
  title: 'Functions and arrows are labelled',
  severity: 'warning',
  check: (model) =>
    diagramIds(model).flatMap((diagramId) => [
      ...functionsOn(model, diagramId)
        .filter((fn) => fn.label.trim() === '')
        .map((fn) => ({ diagramId, subject: { kind: 'function' as const, functionId: fn.id }, message: `${nodeNumber(model, fn.id)} has no name` })),
      ...arrowsOn(model, diagramId)
        .filter((arrow) => arrow.label.trim() === '')
        .map((arrow) => ({ diagramId, subject: { kind: 'arrow' as const, arrowId: arrow.id }, message: 'An arrow has no label' })),
    ]),
};
