import type { Point, Rect } from '../geometry/geometry';
import type { Connection } from './state';

export interface RoutingScene {
  readonly frame: Rect;
  /** The boxes arrows must not pass through. */
  readonly boxes: readonly { readonly id: string; readonly rect: Rect }[];
  readonly connections: readonly Connection[];
}

/**
 * Finds a path for every connection. The contract every implementation must
 * meet (and the contract tests check): one polyline per connection in the
 * same order, starting at `from.point` and ending at `to.point`, made only of
 * horizontal and vertical segments, leaving along `from.heading`, arriving
 * along `to.heading`, and passing through the connection's `via` points.
 */
export interface Router {
  readonly name: string;
  route(scene: RoutingScene): readonly (readonly Point[])[];
}
