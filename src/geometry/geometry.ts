/**
 * The plain geometry of one laid-out diagram: rectangles, polylines and text
 * anchors. This is all the layout pipeline produces and all a renderer or
 * exporter consumes, so neither side knows about the other.
 */
import type { TextStyleName } from '../theme/theme';

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Rect extends Point, Size {}

export type TextAnchor = 'start' | 'middle' | 'end';

export interface TextGeometry {
  /** Anchor point of the first line's baseline. */
  readonly x: number;
  readonly y: number;
  readonly lines: readonly string[];
  readonly style: TextStyleName;
  readonly anchor: TextAnchor;
}

export interface BoxGeometry {
  /** Id of the function the box shows, so a viewer can map clicks to the model. */
  readonly id: string;
  readonly rect: Rect;
  readonly labelLines: readonly string[];
  readonly number: string;
}

export interface ArrowGeometry {
  /** Id of the model arrow this segment path belongs to; a branching arrow has several. */
  readonly arrowId: string;
  /** Orthogonal polyline: consecutive points differ in x or in y, never both. */
  readonly points: readonly Point[];
  readonly head: boolean;
}

/** A short line that ties a label to its arrow when the label cannot sit beside it (rule B10). */
export interface LeaderGeometry {
  /** On the label. */
  readonly from: Point;
  /** On the arrow. */
  readonly to: Point;
}

export const DEFECT_KINDS = [
  'arrow-through-box',
  'arrow-outside-frame',
  'label-on-arrow',
  'label-on-box',
  'label-on-label',
  'label-outside-frame',
] as const;
export type DefectKind = (typeof DEFECT_KINDS)[number];

/** Something wrong with a drawing that the layout could not avoid. Shown to the user as a warning. */
export interface LayoutDefect {
  readonly kind: DefectKind;
  readonly message: string;
}

export interface DiagramGeometry {
  readonly size: Size;
  /** The diagram frame. The footer hangs directly below it. */
  readonly frame: Rect;
  readonly footer: { readonly node: string; readonly title: string; readonly number: string };
  readonly boxes: readonly BoxGeometry[];
  readonly arrows: readonly ArrowGeometry[];
  readonly texts: readonly TextGeometry[];
  readonly leaders: readonly LeaderGeometry[];
  /** Empty when the drawing is clean. */
  readonly defects: readonly LayoutDefect[];
}

export function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

export function contains(outer: Rect, inner: Rect): boolean {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;
}

/** The rectangle a horizontal or vertical segment covers, grown by `pad` on every side. */
export function segmentRect(a: Point, b: Point, pad = 0): Rect {
  return {
    x: Math.min(a.x, b.x) - pad,
    y: Math.min(a.y, b.y) - pad,
    width: Math.abs(a.x - b.x) + 2 * pad,
    height: Math.abs(a.y - b.y) + 2 * pad,
  };
}

export function grow(r: Rect, pad: number): Rect {
  return { x: r.x - pad, y: r.y - pad, width: r.width + 2 * pad, height: r.height + 2 * pad };
}

export const right = (r: Rect): number => r.x + r.width;
export const bottom = (r: Rect): number => r.y + r.height;
