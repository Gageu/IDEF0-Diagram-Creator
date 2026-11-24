import { diagramIds, inheritedBoundary, nodeNumber } from '../../domain';
import type { Rule } from '../rule';

/**
 * M5: every arrow that touches a function on its parent diagram is carried
 * across the boundary of that function's child diagram. The other half of the
 * rule, that no child boundary arrow lacks a parent, cannot be broken: the
 * model accepts a boundary end only with a parent link or an explicit tunnel.
 */
export const levelConsistency: Rule = {
  id: 'M5',
  title: 'Parent arrows appear on the child diagram',
  severity: 'error',
  check: (model) =>
    diagramIds(model).flatMap((diagramId) =>
      inheritedBoundary(model, diagramId)
        .filter((arrow) => arrow.state === 'unconnected')
        .map((arrow) => ({
          diagramId,
          subject: { kind: 'parent-arrow' as const, arrowId: arrow.parentArrowId },
          message: `${arrow.code} "${arrow.label}" from the parent diagram is not connected to any function on ${nodeNumber(model, diagramId)}`,
        })),
    ),
};
