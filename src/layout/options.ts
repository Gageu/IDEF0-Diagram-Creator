/**
 * Layout distances, from part 3 of the rules and style spec. The quality
 * gate planned for a later milestone retries with larger values here.
 */
export interface LayoutOptions {
  /** Space between the canvas edge and the frame. */
  readonly frameInset: number;
  /** The frame never shrinks below this, so small diagrams keep the reference proportions. */
  readonly minFrame: { readonly width: number; readonly height: number };
  readonly box: {
    readonly minWidth: number;
    readonly minHeight: number;
    /** The single box of a context diagram is drawn larger. */
    readonly contextMinWidth: number;
    readonly contextMinHeight: number;
    readonly labelPadding: number;
    /** Minimum distance between arrows on a left or right side. */
    readonly sideSlotSpacing: number;
    /** Minimum distance between arrows on a top or bottom side. */
    readonly topSlotSpacing: number;
  };
  /** Gaps between consecutive boxes of the staircase. */
  readonly staircase: { readonly gapX: number; readonly gapY: number };
  /** Minimum space between the boxes and each frame edge. */
  readonly margin: { readonly left: number; readonly right: number; readonly top: number; readonly bottom: number };
  readonly label: {
    /** Labels beside vertical boundary arrows wrap at this width. */
    readonly wrapWidth: number;
    /** From a boundary arrow's line to its ICOM code, and from the code to the label. */
    readonly codeOffset: number;
    readonly codeWidth: number;
    /** Gap between a label and the line it sits above. */
    readonly lineGap: number;
    /** Free space kept after a label before the next boundary arrow. */
    readonly clearance: number;
  };
  readonly routing: {
    /** How far an arrow runs straight out of or into a box before it may turn. */
    readonly stub: number;
    /** Distance from a box to the arrow that loops around it. */
    readonly loopClearance: number;
    /** Distance from a box to the first jog channel, and between channels. */
    readonly jogClearance: number;
    readonly jogSpacing: number;
  };
}

export const referenceLayoutOptions: LayoutOptions = {
  frameInset: 20,
  minFrame: { width: 1060, height: 540 },
  box: {
    minWidth: 150,
    minHeight: 80,
    contextMinWidth: 260,
    contextMinHeight: 140,
    labelPadding: 12,
    sideSlotSpacing: 20,
    topSlotSpacing: 25,
  },
  staircase: { gapX: 50, gapY: 40 },
  margin: { left: 130, right: 130, top: 110, bottom: 110 },
  label: { wrapWidth: 120, codeOffset: 6, codeWidth: 20, lineGap: 6, clearance: 16 },
  routing: { stub: 25, loopClearance: 30, jogClearance: 60, jogSpacing: 50 },
};
