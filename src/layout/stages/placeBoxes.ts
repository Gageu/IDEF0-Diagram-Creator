import type { LayoutDeps } from '../boundaryLabel';
import { boundaryLabelExtent, widestLine } from '../boundaryLabel';
import type { LayoutStage, PlacedBox } from '../state';
import type { DiagramView, Side, ViewEnd } from '../view';
import { wrapText } from '../wrapText';

/** How many distinct arrows attach to one side of a box. */
function arrowsOnSide(view: DiagramView, boxId: string, side: Side): number {
  const attaches = (end: ViewEnd): boolean => end.kind === 'box' && end.boxId === boxId && end.side === side;
  return view.arrows.filter((a) => (side === 'right' ? a.sources : a.targets).some(attaches)).length;
}

/** The labels of arrows that cross one edge of the frame. */
function boundaryLabels(view: DiagramView, side: Side): string[] {
  return view.arrows
    .filter((a) => (side === 'right' ? a.targets : a.sources).some((e) => e.kind === 'boundary' && e.side === side))
    .map((a) => a.label);
}

/**
 * Stage 2: sizes each box from its label and its busiest side, sets the boxes
 * in a staircase from top-left to bottom-right (rule D1), and sizes the frame
 * and canvas around them with room for the boundary labels.
 */
export function createPlaceBoxesStage(deps: LayoutDeps): LayoutStage {
  const { options, theme, measurer } = deps;
  const o = options.box;

  return {
    name: 'place-boxes',
    run(state) {
      const { view } = state;
      const single = view.boxes.length === 1;
      const minWidth = view.isContext ? o.contextMinWidth : o.minWidth;
      const minHeight = view.isContext ? o.contextMinHeight : o.minHeight;
      const labelWidth = (line: string): number => measurer.width(line, theme.text.boxLabel);

      const sized = view.boxes.map((box) => {
        const count = (side: Side): number => arrowsOnSide(view, box.id, side);
        const longestWord = Math.max(0, ...box.label.split(/\s+/).map(labelWidth));
        const width = Math.ceil(
          Math.max(minWidth, longestWord + 2 * o.labelPadding, (Math.max(count('top'), count('bottom')) + 1) * o.topSlotSpacing),
        );
        const labelLines = wrapText(box.label, width - 2 * o.labelPadding, labelWidth);
        const height = Math.ceil(
          Math.max(
            minHeight,
            labelLines.length * theme.text.boxLabel.lineHeight + 3 * o.labelPadding,
            (Math.max(count('left'), count('right')) + 1) * o.sideSlotSpacing,
          ),
        );
        return { box, width, height, labelLines };
      });

      const stairsWidth = sized.reduce((sum, s) => sum + s.width, 0) + (sized.length - 1) * options.staircase.gapX;
      const stairsHeight = sized.reduce((sum, s) => sum + s.height, 0) + (sized.length - 1) * options.staircase.gapY;

      // Horizontal boundary labels sit above their line, so the margin must hold the longest one.
      const horizontalMargin = (side: Side, minimum: number): number =>
        Math.max(minimum, boundaryLabelExtent(widestLine(boundaryLabels(view, side), deps), options) + 2 * options.routing.stub);
      // Around a single box, vertical boundary arrows fan out to fit their labels
      // and bend back in nested channels, which need extra height.
      const verticalMargin = (side: Side, minimum: number): number => {
        const fanChannels = single ? Math.ceil((boundaryLabels(view, side).length - 1) / 2) : 0;
        return minimum + Math.max(0, fanChannels) * options.routing.jogSpacing;
      };
      const margin = {
        left: horizontalMargin('left', options.margin.left),
        right: horizontalMargin('right', options.margin.right),
        top: verticalMargin('top', options.margin.top),
        bottom: verticalMargin('bottom', options.margin.bottom),
      };

      const frameWidth = Math.max(options.minFrame.width, margin.left + stairsWidth + margin.right);
      const frameHeight = Math.max(options.minFrame.height, margin.top + stairsHeight + margin.bottom);
      const frame = { x: options.frameInset, y: options.frameInset, width: frameWidth, height: frameHeight };
      // Spare room is shared evenly so the staircase sits centred in the frame.
      let x = frame.x + margin.left + Math.round((frameWidth - margin.left - stairsWidth - margin.right) / 2);
      let y = frame.y + margin.top + Math.round((frameHeight - margin.top - stairsHeight - margin.bottom) / 2);

      const boxes: PlacedBox[] = sized.map((s) => {
        const placed = { id: s.box.id, number: s.box.number, labelLines: s.labelLines, rect: { x, y, width: s.width, height: s.height } };
        x += s.width + options.staircase.gapX;
        y += s.height + options.staircase.gapY;
        return placed;
      });

      return {
        ...state,
        boxes,
        frame,
        size: {
          width: frameWidth + 2 * options.frameInset,
          height: frameHeight + 2 * options.frameInset + theme.footer.height,
        },
      };
    },
  };
}

