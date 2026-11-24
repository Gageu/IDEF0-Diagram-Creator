import { arrowsAt, diagramIds, functionsOn, nodeNumber } from '../../domain';
import type { Rule } from '../rule';

/** B4: a function transforms something under some constraint, so it has at least one control and one output. */
export const controlAndOutput: Rule = {
  id: 'B4',
  title: 'Every function has a control and an output',
  severity: 'error',
  check: (model) =>
    diagramIds(model).flatMap((diagramId) =>
      functionsOn(model, diagramId).flatMap((fn) =>
        (['control', 'output'] as const)
          .filter((role) => arrowsAt(model, fn.id, role).length === 0)
          .map((role) => ({
            diagramId,
            subject: { kind: 'function' as const, functionId: fn.id },
            message: `${nodeNumber(model, fn.id)} "${fn.label}" has no ${role}`,
          })),
      ),
    ),
};
