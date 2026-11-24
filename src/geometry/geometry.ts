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

export interface DiagramGeometry {
  readonly size: Size;
  /** The diagram frame. The footer hangs directly below it. */
  readonly frame: Rect;
  readonly footer: { readonly node: string; readonly title: string; readonly number: string };
  readonly boxes: readonly BoxGeometry[];
  readonly arrows: readonly ArrowGeometry[];
  readonly texts: readonly TextGeometry[];
}

export const right = (r: Rect): number => r.x + r.width;
export const bottom = (r: Rect): number => r.y + r.height;
