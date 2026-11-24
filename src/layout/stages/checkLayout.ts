import { contains, grow, intersects, segmentRect, type DefectKind, type LayoutDefect } from '../../geometry/geometry';
import type { LayoutDeps } from '../boundaryLabel';
import type { LayoutStage } from '../state';
import { textBounds } from '../textBounds';

/**
 * Stage 8: inspects the finished drawing and records every defect it finds.
 * It reads only geometry, never how earlier stages reached it, so it holds
 * any placer or router to the same standard: no arrow through a box or
 * outside the frame, no label on an arrow, a box or another label.
 */
export function createCheckLayoutStage(deps: Pick<LayoutDeps, 'theme' | 'measurer'>): LayoutStage {
  return {
    name: 'check-layout',
    run(state) {
      const defects: LayoutDefect[] = [];
      const report = (kind: DefectKind, message: string): void => {
        defects.push({ kind, message });
      };
      const boxes = state.boxes.map((b) => ({ number: b.number, rect: b.rect }));
      const segments = state.routes.flatMap((route) =>
        route.points.slice(1).map((p, i) => ({ arrowId: route.arrowId, rect: segmentRect(route.points[i]!, p) })),
      );
      const labelOfArrow = new Map(state.anchors.map((a) => [a.arrowId, a.text]));
      const arrowName = (arrowId: string): string => `"${labelOfArrow.get(arrowId) ?? arrowId}"`;

      for (const segment of segments) {
        // A segment may touch a box edge, where it ends, but not run through the inside.
        for (const box of boxes) {
          if (intersects(segment.rect, grow(box.rect, -0.5))) report('arrow-through-box', `Arrow ${arrowName(segment.arrowId)} passes through box ${box.number}`);
        }
        if (!contains(state.frame, segment.rect)) report('arrow-outside-frame', `Arrow ${arrowName(segment.arrowId)} leaves the frame`);
      }

      // The note and the box text are checked like any label: nothing may sit on them either.
      const labels = state.texts.map((text) => ({ name: `"${text.lines.join(' ')}"`, rect: textBounds(text, deps) }));
      labels.forEach((label, i) => {
        if (!contains(state.frame, label.rect)) report('label-outside-frame', `Label ${label.name} leaves the frame`);
        for (const box of boxes) {
          if (intersects(label.rect, box.rect)) report('label-on-box', `Label ${label.name} overlaps box ${box.number}`);
        }
        const crossed = new Set(segments.filter((s) => intersects(label.rect, grow(s.rect, 0.5))).map((s) => s.arrowId));
        for (const arrowId of crossed) report('label-on-arrow', `Label ${label.name} sits on arrow ${arrowName(arrowId)}`);
        for (const other of labels.slice(i + 1)) {
          if (intersects(label.rect, other.rect)) report('label-on-label', `Labels ${label.name} and ${other.name} overlap`);
        }
      });

      // The same arrow can trip one check on several segments; report each finding once.
      const unique = [...new Map(defects.map((d) => [d.message, d])).values()];
      return { ...state, defects: unique };
    },
  };
}
