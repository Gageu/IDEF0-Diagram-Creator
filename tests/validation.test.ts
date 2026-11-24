import { describe, expect, it } from 'vitest';
import { addArrow, addFunction, CONTEXT_DIAGRAM, createModel, defineTerm, renameFunction, type Command, type Model } from '../src/domain';
import {
  blocksExport,
  boxCount,
  controlAndOutput,
  duplicateLabel,
  emptyLabel,
  glossaryDefinition,
  idef0Rules,
  levelConsistency,
  looksLikeVerbPhrase,
  validate,
  verbPhrase,
  type Rule,
} from '../src/validation';
import { referenceModel } from './fixtures';

function run(model: Model, ...commands: Command[]): Model {
  return commands.reduce((m, c) => c.apply(m), model);
}

/** A0 with a control and an output, not yet decomposed. */
function context(): Model {
  return run(
    createModel({ rootId: 'root', rootLabel: 'Run Process' }),
    addArrow({ id: 'policy', diagramId: CONTEXT_DIAGRAM, label: 'Policy', sources: [{ kind: 'boundary', link: { kind: 'external', role: 'control' } }], targets: [{ kind: 'function', functionId: 'root', role: 'control' }] }),
    addArrow({ id: 'result', diagramId: CONTEXT_DIAGRAM, label: 'Result', sources: [{ kind: 'function', functionId: 'root' }], targets: [{ kind: 'boundary', link: { kind: 'external' } }] }),
  );
}

function decomposed(count: number): Model {
  return run(context(), ...Array.from({ length: count }, (_, i) => addFunction({ parentId: 'root', id: `f${i + 1}`, label: `Do Step ${i + 1}` })));
}

const messages = (model: Model, rule: Rule): string[] => rule.check(model).map((f) => f.message);

describe('validation', () => {
  /** The reference pack has no glossary, so structural checks leave the glossary rule out. */
  const structuralRules = idef0Rules.filter((rule) => rule !== glossaryDefinition);

  it('finds nothing wrong with the structure of the reference model', () => {
    expect(validate(referenceModel(), structuralRules)).toEqual([]);
  });

  it('a sound context diagram has no structural violations', () => {
    expect(validate(context(), structuralRules)).toEqual([]);
  });

  it('warns once, with a count, while glossary terms lack a definition', () => {
    const model = context();
    expect(messages(model, glossaryDefinition)).toEqual(['3 glossary terms have no definition']);
    const defined = run(model, defineTerm({ term: 'Policy', definition: 'A rule' }), defineTerm({ term: 'Result', definition: 'What comes out' }));
    expect(glossaryDefinition.check(defined)).toEqual([{ diagramId: CONTEXT_DIAGRAM, subject: { kind: 'glossary' }, message: '1 glossary term has no definition' }]);
    expect(messages(run(defined, defineTerm({ term: 'Run Process', definition: 'The activity' })), glossaryDefinition)).toEqual([]);
  });

  it('M5 reports a parent arrow the child diagram does not carry', () => {
    const model = decomposed(3);
    const findings = levelConsistency.check(model);
    expect(findings.map((f) => f.message)).toEqual([
      'C1 "Policy" from the parent diagram is not connected to any function on A0',
      'O1 "Result" from the parent diagram is not connected to any function on A0',
    ]);
    expect(findings[0]).toMatchObject({ diagramId: 'root', subject: { kind: 'parent-arrow', arrowId: 'policy' } });

    const connected = run(
      model,
      addArrow({ diagramId: 'root', label: 'Policy', sources: [{ kind: 'boundary', link: { kind: 'inherited', parentArrowId: 'policy' } }], targets: [{ kind: 'function', functionId: 'f1', role: 'control' }] }),
    );
    expect(messages(connected, levelConsistency)).toEqual(['O1 "Result" from the parent diagram is not connected to any function on A0']);
  });

  it('B4 reports a function with no control or no output', () => {
    const model = createModel({ rootId: 'root', rootLabel: 'Run Process' });
    expect(messages(model, controlAndOutput)).toEqual(['A0 "Run Process" has no control', 'A0 "Run Process" has no output']);
    expect(messages(context(), controlAndOutput)).toEqual([]);
  });

  it('M3 warns outside 3 to 6 boxes and never about the context diagram', () => {
    expect(messages(decomposed(2), boxCount)).toEqual(['A0 has 2 boxes; a diagram should have 3 to 6']);
    expect(messages(decomposed(3), boxCount)).toEqual([]);
    expect(messages(decomposed(6), boxCount)).toEqual([]);
    expect(messages(decomposed(7), boxCount)).toHaveLength(1);
    expect(boxCount.severity).toBe('warning');
  });

  it('B7 warns when two arrows on a diagram share a label', () => {
    const model = run(
      context(),
      addArrow({ id: 'again', diagramId: CONTEXT_DIAGRAM, label: 'policy', sources: [{ kind: 'boundary', link: { kind: 'external', role: 'input' } }], targets: [{ kind: 'function', functionId: 'root', role: 'input' }] }),
    );
    const findings = duplicateLabel.check(model);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.subject).toEqual({ kind: 'arrow', arrowId: 'again' });
  });

  it('B1 warns about function names that are not a verb and its object', () => {
    expect(looksLikeVerbPhrase('Analyze Change Impact')).toBe(true);
    expect(looksLikeVerbPhrase('Implement Approved Change')).toBe(true);
    expect(looksLikeVerbPhrase('Analysis')).toBe(false);
    expect(looksLikeVerbPhrase('The Review')).toBe(false);
    expect(messages(run(context(), renameFunction({ id: 'root', label: 'Process' })), verbPhrase)).toHaveLength(1);
  });

  it('warns about empty labels, and B1 leaves them to that rule', () => {
    const model = run(context(), renameFunction({ id: 'root', label: ' ' }));
    expect(messages(model, emptyLabel)).toEqual(['A0 has no name']);
    expect(messages(model, verbPhrase)).toEqual([]);
  });

  it('lists errors first and errors block export of their own diagram only', () => {
    const violations = validate(decomposed(2), idef0Rules);
    const severities = violations.map((v) => v.severity);
    expect(severities).toEqual([...severities].sort((a, b) => a.localeCompare(b)));
    expect(blocksExport(violations, 'root')).toBe(true);
    expect(blocksExport(violations, CONTEXT_DIAGRAM)).toBe(false);
  });

  it('every rule has a unique id', () => {
    const ids = idef0Rules.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
