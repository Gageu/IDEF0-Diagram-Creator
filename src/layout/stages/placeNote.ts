import { bottom, type TextGeometry } from '../../geometry/geometry';
import type { LayoutDeps } from '../boundaryLabel';
import type { LayoutStage } from '../state';
import { wrapText } from '../wrapText';

/**
 * Sets the purpose / viewpoint / context note of a context diagram in the
 * empty space below the inputs, left of the box.
 */
export function createPlaceNoteStage(deps: LayoutDeps): LayoutStage {
  const inset = 20;
  return {
    name: 'place-note',
    run(state) {
      const box = state.boxes[0];
      if (state.view.note.length === 0 || !box) return state;
      const style = deps.theme.text.note;
      const x = state.frame.x + inset;
      const width = box.rect.x - x - 2 * inset;
      const lines = state.view.note.flatMap((paragraph) => wrapGreedy(paragraph, width, (line) => deps.measurer.width(line, style)));
      const note: TextGeometry = { x, y: bottom(box.rect) + 30, lines, style: 'note', anchor: 'start' };
      return { ...state, texts: [...state.texts, note] };
    },
  };
}

/** Paragraph text fills each line before starting the next, unlike balanced labels. */
function wrapGreedy(text: string, maxWidth: number, measure: (line: string) => number): string[] {
  const lines: string[] = [];
  for (const word of text.split(/\s+/)) {
    const last = lines[lines.length - 1];
    if (last !== undefined && measure(`${last} ${word}`) <= maxWidth) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines;
}
