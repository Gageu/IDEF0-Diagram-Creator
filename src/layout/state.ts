import type { ArrowGeometry, LayoutDefect, LeaderGeometry, Point, Rect, Size, TextGeometry, TunnelMark } from '../geometry/geometry';
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

/**
 * One run between two fixed points, the unit a router works on. An arrow
 * that branches or joins is planned as several connections with the same
 * `netId`; those may share a path, and the shared part is drawn once.
 */
export interface Connection {
  /** Connections of one net are drawn as one tree: an arrow, or a bundle and its splits. */
  readonly netId: string;
  readonly arrowId: string;
  readonly from: Port;
  readonly to: Port;
  /** Set when the end is on a box; otherwise the end is at the frame or on the net's own path. */
  readonly fromBoxId?: string;
  readonly toBoxId?: string;
  /** Points the run must pass through, in order: the corners of a path the planner has already fixed. */
  readonly via?: readonly Point[];
  /** Whether the run ends in an arrowhead. A run that ends on its net's trunk does not. */
  readonly head: boolean;
}

/** Text that belongs next to an arrow, with where the arrow is at that point. */
export interface LabelAnchor {
  readonly arrowId: string;
  readonly text: string;
  /** ICOM code shown with the label, at a frame edge only. */
  readonly code: string | undefined;
  /** A point on the arrow: where it crosses the frame, leaves a box or leaves its trunk. */
  readonly point: Point;
  /** The frame edge the point is on, or `none` inside the diagram. */
  readonly edge: Side | 'none';
  /** Which way the arrow runs at the point. */
  readonly run: 'horizontal' | 'vertical';
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
  /** Where each arrow meets each box side, keyed by `slotKey`. */
  readonly slots: Readonly<Record<string, Point>>;
  readonly connections: readonly Connection[];
  readonly anchors: readonly LabelAnchor[];
  readonly routes: readonly ArrowGeometry[];
  readonly texts: readonly TextGeometry[];
  readonly leaders: readonly LeaderGeometry[];
  readonly tunnels: readonly TunnelMark[];
  readonly defects: readonly LayoutDefect[];
}

export function slotKey(boxId: string, side: Side, arrowId: string): string {
  return `${boxId}/${side}/${arrowId}`;
}

/** One step of the layout pipeline: a pure function from state to state. */
export interface LayoutStage {
  readonly name: string;
  run(state: LayoutState): LayoutState;
}

export function initialState(view: DiagramView): LayoutState {
  const empty = { x: 0, y: 0, width: 0, height: 0 };
  return { view, size: empty, frame: empty, boxes: [], slots: {}, connections: [], anchors: [], routes: [], texts: [], leaders: [], tunnels: [], defects: [] };
}
