import { bottom, type Point } from '../../geometry/geometry';
import type { LayoutOptions } from '../options';
import type { Router, RoutingScene } from '../router';
import type { Connection } from '../state';

/**
 * A router with no search: it picks a fixed path shape from the directions of
 * the two ends. The shapes lean on the staircase (later boxes sit right of
 * and below earlier ones), which keeps them out of boxes, but arrows are
 * routed one at a time and may run on top of each other. It is the baseline
 * the obstacle-avoiding routers replace behind the same interface.
 */
export function createNaiveRouter(options: LayoutOptions['routing']): Router {
  const { stub, loopClearance, jogClearance, jogSpacing } = options;

  /**
   * Arrows that enter the same box side from offset positions each get their
   * own horizontal channel, nested so the outermost arrow turns closest to
   * the box and no two of them cross.
   */
  const jogChannels = (connections: readonly Connection[]): Map<Connection, number> => {
    const channels = new Map<Connection, number>();
    const jogs = connections.filter((c) => c.from.heading === c.to.heading && c.from.heading !== 'east' && c.from.point.x !== c.to.point.x);
    const groups = new Map<string, Connection[]>();
    for (const c of jogs) {
      const key = `${c.toBoxId}/${c.to.heading}/${c.from.point.x < c.to.point.x ? 'fromLeft' : 'fromRight'}`;
      groups.set(key, [...(groups.get(key) ?? []), c]);
    }
    for (const group of groups.values()) {
      const outermostFirst = [...group].sort((a, b) => Math.abs(b.from.point.x - b.to.point.x) - Math.abs(a.from.point.x - a.to.point.x));
      outermostFirst.forEach((c, k) => {
        const offset = jogClearance + k * jogSpacing;
        channels.set(c, c.to.heading === 'south' ? c.to.point.y - offset : c.to.point.y + offset);
      });
    }
    return channels;
  };

  const path = (c: Connection, scene: RoutingScene, channels: Map<Connection, number>): Point[] => {
    const a = c.from.point;
    const b = c.to.point;
    if (c.via && c.via.length > 0) return [a, ...c.via, b];
    const fromBox = scene.boxes.find((box) => box.id === c.fromBoxId);
    const below = (fromBox ? bottom(fromBox.rect) : a.y) + loopClearance;
    const shape = `${c.from.heading}>${c.to.heading}`;

    switch (shape) {
      case 'east>east': {
        if (a.y === b.y && b.x >= a.x) return [a, b];
        if (b.x - a.x >= 2 * stub) {
          // Forward: run along the source's row and drop in the gap beside the target.
          const turn = c.toBoxId ? b.x - stub : a.x + stub;
          return [a, { x: turn, y: a.y }, { x: turn, y: b.y }, b];
        }
        // Feedback to an input: loop below the source box (rule D3).
        return [a, { x: a.x + stub, y: a.y }, { x: a.x + stub, y: below }, { x: b.x - stub, y: below }, { x: b.x - stub, y: b.y }, b];
      }
      case 'south>south':
      case 'north>north': {
        if (a.x === b.x) return [a, b];
        const channel = channels.get(c) ?? (a.y + b.y) / 2;
        return [a, { x: a.x, y: channel }, { x: b.x, y: channel }, b];
      }
      case 'east>south': {
        if (b.x >= a.x + stub && b.y > a.y) return [a, { x: b.x, y: a.y }, b];
        // Feedback to a control: loop above the target box (rule D3).
        const above = b.y - loopClearance;
        return [a, { x: a.x + stub, y: a.y }, { x: a.x + stub, y: above }, { x: b.x, y: above }, b];
      }
      case 'east>north': {
        // Already below the end point: one corner, as on a bus lane.
        if (a.y > b.y && b.x > a.x) return [a, { x: b.x, y: a.y }, b];
        const under = Math.max(below, b.y + loopClearance);
        return [a, { x: a.x + stub, y: a.y }, { x: a.x + stub, y: under }, { x: b.x, y: under }, b];
      }
      case 'north>south':
      case 'south>north': {
        // Opposed verticals: pass the box and turn back into its far side.
        const beyond = c.to.heading === 'south' ? b.y - loopClearance : b.y + loopClearance;
        return [a, { x: a.x, y: beyond }, { x: b.x, y: beyond }, b];
      }
      default:
        // A vertical start meeting a horizontal end: one corner.
        return [a, { x: a.x, y: b.y }, b];
    }
  };

  return {
    name: 'naive',
    route(scene) {
      const channels = jogChannels(scene.connections);
      return scene.connections.map((c) => path(c, scene, channels));
    },
  };
}
