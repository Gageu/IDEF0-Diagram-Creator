import { describe, expect, it } from 'vitest';
import {
  arrowsOn,
  boundaryCode,
  CONTEXT_DIAGRAM,
  diagramIds,
  diagramNode,
  diagramNumber,
  diagramTitle,
  functionsOn,
  inheritedBoundary,
  integrityProblems,
  nodeNumber,
} from '../src/domain';
import { parseModel, serializeModel } from '../src/persistence';
import { referenceModel, referencePackText } from './fixtures';

interface PackDiagram {
  node: string;
  number: string;
  title: string;
  parent_box?: string;
  boxes: { id: string; label: string }[];
  arrows: { label: string; icom?: string; bundle_of?: string[]; unbundles?: { label: string }[] }[];
}
const pack = JSON.parse(referencePackText) as { diagrams: PackDiagram[] };

describe('reference model (podcast_model.json)', () => {
  const model = referenceModel();

  it('loads with no integrity problems', () => {
    expect(integrityProblems(model)).toEqual([]);
  });

  it('derives every node, title and diagram number stored in the pack', () => {
    const ids = diagramIds(model);
    expect(ids.map((id) => diagramNode(model, id))).toEqual(pack.diagrams.map((d) => d.node));
    expect(ids.map((id) => diagramNumber(model, id))).toEqual(pack.diagrams.map((d) => d.number));
    expect(ids.map((id) => diagramTitle(model, id))).toEqual(pack.diagrams.map((d) => d.title));
  });

  it('derives box numbers from tree position', () => {
    for (const diagram of pack.diagrams) {
      const boxes = functionsOn(model, diagram.parent_box ?? CONTEXT_DIAGRAM);
      expect(boxes.map((b) => nodeNumber(model, b.id))).toEqual(diagram.boxes.map((b) => b.id));
      expect(boxes.map((b) => b.label)).toEqual(diagram.boxes.map((b) => b.label));
    }
  });

  it('derives the ICOM code the pack states for every boundary arrow', () => {
    for (const diagram of pack.diagrams) {
      const arrows = arrowsOn(model, diagram.parent_box ?? CONTEXT_DIAGRAM);
      for (const packArrow of diagram.arrows) {
        if (!packArrow.icom) continue;
        // A bundle is stored as its named member arrows, which share the bundle's code.
        const labels = packArrow.unbundles?.map((u) => u.label) ?? packArrow.bundle_of ?? [packArrow.label];
        for (const label of labels) {
          const arrow = arrows.find((a) => a.label === label)!;
          const end = packArrow.icom.startsWith('O') ? 'target' : 'source';
          expect(boundaryCode(model, arrow, end), `${diagram.node} ${label}`).toBe(packArrow.icom);
        }
      }
    }
  });

  it('connects every parent arrow inside each child diagram', () => {
    for (const id of diagramIds(model)) {
      expect(inheritedBoundary(model, id).filter((b) => b.state === 'unconnected')).toEqual([]);
    }
    const a0 = inheritedBoundary(model, model.rootId);
    expect(a0.map((b) => b.code).join(' ')).toBe('I1 I2 C1 C2 C3 O1 O2 O3 M1 M2 M3');
    expect(a0.find((b) => b.code === 'M1')).toMatchObject({ label: 'Production team', state: 'split' });
    expect(a0.find((b) => b.code === 'M1')!.childArrowIds).toHaveLength(5);
  });

  it('survives a save and load round trip unchanged', () => {
    expect(parseModel(serializeModel(model))).toEqual(model);
  });
});

describe('parseModel', () => {
  it('rejects files that are not models, with the location of the problem', () => {
    expect(() => parseModel('{')).toThrow(/Not valid JSON/);
    expect(() => parseModel('{"format":"other"}')).toThrow(/Not an idef0-model file/);
    const broken = JSON.parse(serializeModel(referenceModel()));
    broken.arrows[0].targets[0].role = 'output';
    expect(() => parseModel(JSON.stringify(broken))).toThrow(/arrows\[0\]\.targets\[0\]\.role/);
    const dangling = JSON.parse(serializeModel(referenceModel()));
    dangling.arrows[0].targets[0].functionId = 'nope';
    expect(() => parseModel(JSON.stringify(dangling))).toThrow(/Inconsistent model/);
  });
});
