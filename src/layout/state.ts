import type { ArrowGeometry, Point, Rect, Size, TextGeometry } from '../geometry/geometry';
import type { DiagramView, Side } from './view';

export interface PlacedBox {
  readonly id: string;
  readonly rect: Rect;
  readonly labelLines: readonly string[];
  readonly number: string;
}

/** The direction an arrow travels as it leaves or arrives at a port. */
export type Heading = 'east' | 'south' | 'north';

export interface Port {
  readonly point: Point;
  readonly heading: Heading;
}

export interface BoundaryPort {
  readonly side: Side;
  readonly code: string | undefined;
}

/**
 * One source-to-target run of an arrow, with fixed end points. A branching or
 * joining arrow yields one connection per source and target pair.
 */
export interface Connection {
  readonly arrowId: string;
  readonly label: string;
  readonly from: Port;
  readonly to: Port;
  /** Set when the end is a box; otherwise the matching boundary field is set. */
  readonly fromBoxId?: string;
  readonly toBoxId?: string;
  readonly fromBoundary?: BoundaryPort;
  readonly toBoundary?: BoundaryPort;
}

/**
 * What the pipeline knows about a diagram so far. Each stage fills in its
 * part and passes the state on; nothing in it is SVG.
 */
export interface LayoutState {
  readonly view: DiagramView;
  readonly size: Size;
  readonly frame: Rect;
  readonly boxes: readonly PlacedBox[];
  readonly connections: readonly Connection[];
  /** One routed polyline per connection, in the same order. */
  readonly routes: readonly ArrowGeometry[];
  readonly texts: readonly TextGeometry[];
}

/** One step of the layout pipeline: a pure function from state to state. */
export interface LayoutStage {
  readonly name: string;
  run(state: LayoutState): LayoutState;
}

export function initialState(view: DiagramView): LayoutState {
  const empty = { x: 0, y: 0, width: 0, height: 0 };
  return { view, size: empty, frame: empty, boxes: [], connections: [], routes: [], texts: [] };
}
