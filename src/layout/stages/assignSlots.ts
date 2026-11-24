import { bottom, right, type Point } from '../../geometry/geometry';
import { slotKey, type LayoutStage } from '../state';
import type { Side } from '../view';

const SIDES: readonly Side[] = ['left', 'top', 'right', 'bottom'];

/**
 * Stage 3: fixes the point where each arrow meets each box side. The arrows
 * of a side share it evenly, in the side order the view carries (which is
 * also the order ICOM codes follow).
 */
export function createAssignSlotsStage(): LayoutStage {
  return {
    name: 'assign-slots',
    run(state) {
      const slots: Record<string, Point> = {};
      for (const viewBox of state.view.boxes) {
        const rect = state.boxes.find((b) => b.id === viewBox.id)!.rect;
        for (const side of SIDES) {
          const arrowIds = viewBox.sides[side];
          arrowIds.forEach((arrowId, i) => {
            const fraction = (i + 1) / (arrowIds.length + 1);
            const along =
              side === 'left' || side === 'right'
                ? { x: side === 'left' ? rect.x : right(rect), y: Math.round(rect.y + rect.height * fraction) }
                : { x: Math.round(rect.x + rect.width * fraction), y: side === 'top' ? rect.y : bottom(rect) };
            slots[slotKey(viewBox.id, side, arrowId)] = along;
          });
        }
      }
      return { ...state, slots };
    },
  };
}
