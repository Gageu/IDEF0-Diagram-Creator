import { describe, expect, it } from 'vitest';
import { CONTEXT_DIAGRAM } from '../src/domain';
import type { ArrowGeometry, Point } from '../src/geometry/geometry';
import { buildDiagramView, createMergeBusesStage, initialState, type Connection } from '../src/layout';
import { referenceModel } from './fixtures';

const p = (x: number, y: number): Point => ({ x, y });

/** Runs the stage on bare routes; only the net of each connection matters to it. */
function merge(...routes: { net: string; points: Point[]; head?: boolean }[]): ArrowGeometry[] {
  const state = initialState(buildDiagramView(referenceModel(), CONTEXT_DIAGRAM));
  const port = { point: p(0, 0), heading: 'east' as const };
  const connections: Connection[] = routes.map((r) => ({ netId: r.net, arrowId: r.net, from: port, to: port, head: true }));
  const geometry = routes.map((r) => ({ arrowId: r.net, points: r.points, head: r.head ?? true }));
  return [...createMergeBusesStage().run({ ...state, connections, routes: geometry }).routes];
}

describe('merge buses', () => {
  it('starts a branch at the T-junction where it leaves the trunk', () => {
    const [branch, trunk] = merge(
      { net: 'n', points: [p(0, 0), p(100, 0), p(100, 50)] },
      { net: 'n', points: [p(0, 0), p(300, 0), p(300, 80)] },
    );
    expect(trunk!.points).toEqual([p(0, 0), p(300, 0), p(300, 80)]);
    expect(branch).toEqual({ arrowId: 'n', head: true, points: [p(100, 0), p(100, 50)] });
  });

  it('keeps a bend that the branch makes after the fork', () => {
    const [trunk, branch] = merge(
      { net: 'n', points: [p(0, 0), p(40, 0), p(40, 200), p(90, 200)] },
      { net: 'n', points: [p(0, 0), p(40, 0), p(40, 120), p(90, 120)] },
    );
    expect(trunk!.points).toHaveLength(4);
    expect(branch!.points).toEqual([p(40, 120), p(90, 120)]);
  });

  it('ends a join on the trunk without an arrowhead', () => {
    const [trunk, join] = merge(
      { net: 'n', points: [p(0, 100), p(200, 100), p(200, 0)], head: false },
      { net: 'n', points: [p(0, 60), p(200, 60), p(200, 0)], head: false },
    );
    expect(trunk!.points).toEqual([p(0, 100), p(200, 100), p(200, 0)]);
    expect(join).toEqual({ arrowId: 'n', head: false, points: [p(0, 60), p(200, 60)] });
  });

  it('drops a run that lies entirely on its trunk and leaves other nets alone', () => {
    const routes = merge(
      { net: 'n', points: [p(0, 0), p(300, 0)] },
      { net: 'n', points: [p(0, 0), p(300, 0)] },
      { net: 'other', points: [p(0, 0), p(300, 0)] },
    );
    expect(routes.map((r) => r.arrowId)).toEqual(['n', 'other']);
  });
});
