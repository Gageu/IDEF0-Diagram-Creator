import { CONTEXT_DIAGRAM, diagramIds, functionsOn, nodeNumber } from '../../domain';
import type { Rule } from '../rule';

export const MIN_BOXES = 3;
export const MAX_BOXES = 6;

/** M3: a child diagram has three to six boxes. A warning, because the layout draws any count. */
export const boxCount: Rule = {
  id: 'M3',
  title: 'A child diagram has 3 to 6 boxes',
  severity: 'warning',
  check: (model) =>
    diagramIds(model)
      .filter((diagramId) => diagramId !== CONTEXT_DIAGRAM)
      .flatMap((diagramId) => {
        const count = functionsOn(model, diagramId).length;
        if (count >= MIN_BOXES && count <= MAX_BOXES) return [];
        return [{
          diagramId,
          subject: { kind: 'diagram' as const },
          message: `${nodeNumber(model, diagramId)} has ${count} ${count === 1 ? 'box' : 'boxes'}; a diagram should have ${MIN_BOXES} to ${MAX_BOXES}`,
        }];
      }),
};
