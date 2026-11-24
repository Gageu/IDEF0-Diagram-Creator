import { useState } from 'react';
import { CONTEXT_DIAGRAM, defineTerm, diagramNode, glossaryTerms, inheritedBoundary, removeTerm } from '../../domain';
import type { Violation } from '../../validation';
import type { Selection } from '../editor/editorState';
import type { Editor } from '../editor/useEditor';
import { ConnectParentArrow } from './ConnectParentArrow';
import { TextField } from './TextField';

type Tab = 'violations' | 'inherited' | 'glossary';

function subjectSelection(violation: Violation): Selection {
  const { subject } = violation;
  if (subject.kind === 'function') return { kind: 'function', id: subject.functionId };
  if (subject.kind === 'arrow') return { kind: 'arrow', id: subject.arrowId };
  if (subject.kind === 'parent-arrow') return { kind: 'parent-arrow', id: subject.arrowId };
  return { kind: 'none' };
}

/** The drawer under the diagram: rule violations for the whole model, and the open diagram's inherited arrows. */
export function BottomPanel({ editor }: { editor: Editor }) {
  const { model, state, violations } = editor;
  const [tab, setTab] = useState<Tab>('violations');
  const inherited = inheritedBoundary(model, state.diagramId);
  const errors = violations.filter((v) => v.severity === 'error').length;
  const unconnected = inherited.filter((p) => p.state === 'unconnected').length;
  const terms = glossaryTerms(model).sort((a, b) => a.term.localeCompare(b.term, undefined, { sensitivity: 'base' }));
  const undefinedTerms = terms.filter((t) => t.used && t.definition.trim() === '').length;

  const show = (violation: Violation): void => {
    if (violation.subject.kind === 'glossary') setTab('glossary');
    else editor.open(violation.diagramId, subjectSelection(violation));
  };

  return (
    <section className="pane drawer" aria-label="Checks">
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'violations'} onClick={() => setTab('violations')}>
          Violations <span className={`count ${errors > 0 ? 'is-error' : ''}`}>{violations.length}</span>
        </button>
        <button role="tab" aria-selected={tab === 'inherited'} onClick={() => setTab('inherited')}>
          Inherited arrows <span className={`count ${unconnected > 0 ? 'is-error' : ''}`}>{unconnected > 0 ? `${unconnected} unconnected` : inherited.length}</span>
        </button>
        <button role="tab" aria-selected={tab === 'glossary'} onClick={() => setTab('glossary')}>
          Glossary <span className="count">{undefinedTerms > 0 ? `${undefinedTerms} undefined` : terms.length}</span>
        </button>
      </div>
      {tab === 'violations' && (
        <ul className="violations">
          {violations.length === 0 && <li className="empty">No rule violations.</li>}
          {violations.map((v, i) => (
            <li key={i}>
              <button className="violation" onClick={() => show(v)} title="Show this">
                <span className={`badge is-${v.severity}`}>{v.severity}</span>
                <span className="rule-id">{v.ruleId}</span>
                <span className="diagram-id">{diagramNode(model, v.diagramId)}</span>
                <span>{v.message}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {tab === 'inherited' && (
        <table className="inherited">
          <tbody>
            {inherited.length === 0 && <tr><td className="empty">{state.diagramId === CONTEXT_DIAGRAM ? 'The context diagram has no parent.' : 'The parent box has no arrows yet.'}</td></tr>}
            {inherited.map((p) => (
              <tr key={p.parentArrowId}>
                <td className="rule-id">{p.code}</td>
                <td><button className="link" onClick={() => editor.select({ kind: 'parent-arrow', id: p.parentArrowId })}>{p.label || '(no label)'}</button></td>
                <td><span className={`badge is-${p.state === 'unconnected' ? 'error' : 'ok'}`}>{p.state}</span></td>
                <td>{p.state === 'unconnected' && <ConnectParentArrow editor={editor} diagramId={state.diagramId} parentArrowId={p.parentArrowId} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {tab === 'glossary' && (
        <table className="glossary">
          <tbody>
            {terms.length === 0 && <tr><td className="empty">Terms appear here as functions and arrows are named.</td></tr>}
            {terms.map((t) => (
              <tr key={t.term}>
                <th scope="row">
                  {t.term}
                  {!t.used && <span className="badge is-warning" title="No function or arrow has this name any more. The definition is kept in case the name comes back.">unused</span>}
                </th>
                <td>
                  <TextField value={t.definition} label={`Definition of ${t.term}`} onCommit={(definition) => editor.run(defineTerm({ term: t.term, definition }))} />
                </td>
                <td>{!t.used && <button onClick={() => editor.run(removeTerm({ term: t.term }))}>Remove</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
