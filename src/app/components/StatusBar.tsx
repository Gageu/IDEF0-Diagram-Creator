import { arrowsOn, diagramNode, functionsOn, inheritedBoundary } from '../../domain';
import { hasUnsavedChanges } from '../editor/editorState';
import type { Screen } from '../useScreen';
import { Icon } from './Icon';

const plural = (count: number, one: string, many = `${one}s`): string => `${count} ${count === 1 ? one : many}`;

/** The strip along the bottom: the state of the rule checks, what the open diagram holds, and whether the work is saved. */
export function StatusBar({ screen }: { screen: Screen }) {
  const { editor, workspace } = screen;
  const { model, state, violations } = editor;
  const errors = violations.filter((v) => v.severity === 'error').length;
  const warnings = violations.length - errors;
  const unconnected = inheritedBoundary(model, state.diagramId).filter((p) => p.state === 'unconnected').length;

  return (
    <footer className="statusbar">
      <button
        className="status-button"
        aria-expanded={workspace.state.violationsOpen}
        title={workspace.state.violationsOpen ? 'Hide the violations' : 'Show the violations'}
        onClick={() => workspace.dispatch({ type: 'toggle-panel', panel: 'violations' })}
      >
        {violations.length === 0 ? (
          <span className="status-ok"><Icon name="check" size={14} /> No violations</span>
        ) : (
          <>
            <span className={errors > 0 ? 'status-error' : 'status-muted'}><Icon name="error" size={14} /> {plural(errors, 'error')}</span>
            <span className={warnings > 0 ? 'status-warning' : 'status-muted'}><Icon name="warning" size={14} /> {plural(warnings, 'warning')}</span>
          </>
        )}
      </button>
      <span className="status-text">
        {diagramNode(model, state.diagramId)} · {plural(functionsOn(model, state.diagramId).length, 'function')} · {plural(arrowsOn(model, state.diagramId).length, 'arrow')}
      </span>
      {unconnected > 0 && <span className="status-text status-error">{plural(unconnected, 'parent arrow')} not connected</span>}
      <span className="spacer" />
      <span className="status-text">{hasUnsavedChanges(state) ? 'Unsaved changes, kept in this browser' : 'Saved'}</span>
    </footer>
  );
}
