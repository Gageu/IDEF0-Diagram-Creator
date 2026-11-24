import { diagramNode } from '../../domain';
import type { Violation } from '../../validation';
import type { Selection } from '../editor/editorState';
import type { Screen } from '../useScreen';
import { Icon } from './Icon';

function subjectSelection(violation: Violation): Selection {
  const { subject } = violation;
  if (subject.kind === 'function') return { kind: 'function', id: subject.functionId };
  if (subject.kind === 'arrow') return { kind: 'arrow', id: subject.arrowId };
  if (subject.kind === 'parent-arrow') return { kind: 'parent-arrow', id: subject.arrowId };
  return { kind: 'none' };
}

/** The rule violations of the whole model, in a panel under the diagram that the status bar opens and closes. Each one leads to its element. */
export function ViolationsPanel({ screen }: { screen: Screen }) {
  const { editor, workspace } = screen;
  const { model, violations } = editor;

  const show = (violation: Violation): void => {
    if (violation.subject.kind === 'glossary') workspace.dispatch({ type: 'show', view: 'glossary', glossaryFilter: 'undefined' });
    else editor.open(violation.diagramId, subjectSelection(violation));
  };

  return (
    <section className="violations-panel" aria-label="Violations">
      <header className="section-header">
        <h2>Violations</h2>
        <span className="count">{violations.length}</span>
        <span className="spacer" />
        <button className="ghost icon-button small" aria-label="Close violations" title="Close" onClick={() => workspace.dispatch({ type: 'toggle-panel', panel: 'violations' })}>
          <Icon name="close" />
        </button>
      </header>
      <ul className="violations">
        {violations.length === 0 && (
          <li className="empty"><Icon name="check" /> No rule violations. Every diagram can be exported.</li>
        )}
        {violations.map((v, i) => (
          <li key={i}>
            <button className={`violation is-${v.severity}`} onClick={() => show(v)} title="Show this">
              <Icon name={v.severity} />
              <span className="rule-id">{v.ruleId}</span>
              <span className="diagram-id">{diagramNode(model, v.diagramId)}</span>
              <span className="violation-message">{v.message}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
