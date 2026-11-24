import { useEffect, useRef, useState } from 'react';
import {
  addArrowSource,
  addArrowTarget,
  arrowsAt,
  arrowsOn,
  defineTerm,
  deleteArrow,
  deleteFunction,
  diagramOfFunction,
  getArrow,
  getFunction,
  inheritedBoundary,
  moveArrow,
  moveFunction,
  nodeNumber,
  parentOf,
  removeArrowSource,
  removeArrowTarget,
  renameArrow,
  ROLES,
  updateInfo,
  type ArrowId,
  type FunctionId,
  type ModelInfo,
  type Role,
} from '../../domain';
import { detachArrow, sourceChoices, targetChoices } from '../editor/arrowEntry';
import { parentArrowMenu } from '../editor/contextMenu';
import { describeSource, describeTarget, ROLE_TITLE } from '../editor/describe';
import { decomposeStep, renameFunctionCommand } from '../editor/functionActions';
import { definitionOf } from '../editor/glossaryView';
import type { FocusField } from '../editor/workspaceState';
import type { Screen } from '../useScreen';
import { AddArrowRow } from './AddArrowRow';
import { EndSelect } from './EndSelect';
import { Icon } from './Icon';
import { TextField } from './TextField';

const ROLE_KEY: Record<Role, string> = { input: 'i', control: 'c', output: 'o', mechanism: 'm' };
const ROLE_HINT: Record<Role, string> = {
  input: 'What the function transforms. Enters on the left.',
  control: 'What governs how the function works. Enters on top.',
  output: 'What the function produces. Leaves on the right.',
  mechanism: 'Who or what performs the function. Enters from below.',
};

type Field = HTMLInputElement | HTMLTextAreaElement;

/**
 * Moves the cursor to a field when something elsewhere on the screen asks
 * for it (a menu's "Rename", the I C O M keys). Returns the place to register
 * each field under its name.
 */
function useFocusRequests(screen: Screen): (field: FocusField) => (element: Field | null) => void {
  const fields = useRef<Partial<Record<FocusField, Field | null>>>({});
  const { focus } = screen.workspace.state;
  const { dispatch } = screen.workspace;
  useEffect(() => {
    if (focus === undefined) return;
    fields.current[focus]?.focus();
    dispatch({ type: 'focused' });
  }, [focus, dispatch]);
  return (field) => (element) => {
    fields.current[field] = element;
  };
}

/** The editor panel for whatever is selected: a function, an arrow, a parent arrow, or the model's own details. */
export function Inspector({ screen }: { screen: Screen }) {
  const { selection } = screen.editor.state;
  return (
    <aside className="inspector" aria-label="Editor">
      {selection.kind === 'function' && <FunctionEditor key={selection.id} screen={screen} functionId={selection.id} />}
      {selection.kind === 'arrow' && <ArrowEditor key={selection.id} screen={screen} arrowId={selection.id} />}
      {selection.kind === 'parent-arrow' && <ParentArrowEditor screen={screen} arrowId={selection.id} />}
      {selection.kind === 'none' && <ModelDetails screen={screen} />}
    </aside>
  );
}

/** The glossary definition of the selected element's name, edited where the name is. */
function DefinitionField({ screen, term, register }: { screen: Screen; term: string; register(element: Field | null): void }) {
  const { editor } = screen;
  const named = term.trim() !== '';
  return (
    <label className="field">
      <span>Glossary definition</span>
      <TextField
        multiline
        fieldRef={register}
        value={named ? definitionOf(editor.model, term) : ''}
        label={`Definition of ${term}`}
        disabled={!named}
        placeholder={named ? `What “${term}” means in this model` : 'Name it first'}
        onCommit={(definition) => editor.run(defineTerm({ term, definition }))}
      />
    </label>
  );
}

function FunctionEditor({ screen, functionId }: { screen: Screen; functionId: FunctionId }) {
  const { editor, workspace } = screen;
  const { model } = editor;
  const fn = getFunction(model, functionId);
  const parentId = parentOf(model, functionId);
  const siblings = parentId === undefined ? [] : getFunction(model, parentId).children;
  const index = siblings.indexOf(functionId);
  const decompose = decomposeStep(model, functionId);
  const register = useFocusRequests(screen);

  // I, C, O and M jump to the matching add row, so arrows can be entered without the mouse.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return;
      const role = ROLES.find((r) => ROLE_KEY[r] === event.key.toLowerCase());
      if (!role) return;
      event.preventDefault();
      workspace.dispatch({ type: 'focus', field: role });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [workspace]);

  return (
    <>
      <header className="inspector-header">
        <span className="kind-chip">Function</span>
        <h2>{nodeNumber(model, functionId)}</h2>
        <span className="spacer" />
        <button className="ghost icon-button" disabled={index <= 0} onClick={() => editor.run(moveFunction({ id: functionId, toIndex: index - 1 }))} aria-label="Move earlier" title="Move earlier in the diagram; renumbers the boxes">
          <Icon name="up" />
        </button>
        <button className="ghost icon-button" disabled={index < 0 || index >= siblings.length - 1} onClick={() => editor.run(moveFunction({ id: functionId, toIndex: index + 1 }))} aria-label="Move later" title="Move later in the diagram; renumbers the boxes">
          <Icon name="down" />
        </button>
        <button className="ghost icon-button danger" disabled={parentId === undefined} onClick={() => editor.run(deleteFunction({ id: functionId }))} aria-label="Delete function" title="Delete this function, its decomposition and its arrows (Del)">
          <Icon name="trash" />
        </button>
      </header>
      <label className="field">
        <span>Name</span>
        <TextField fieldRef={register('label')} value={fn.label} label="Function name" placeholder="A verb phrase, such as Review Request" onCommit={(label) => editor.run(renameFunctionCommand(model, functionId, label))} />
      </label>
      <DefinitionField screen={screen} term={fn.label} register={register('definition')} />
      {decompose ? (
        <button className="wide" onClick={() => screen.act({ type: 'run', ...decompose })} title="Give this function a child diagram">
          <Icon name="decompose" /> Decompose into a child diagram
        </button>
      ) : (
        <button className="wide" onClick={() => editor.open(functionId, { kind: 'function', id: functionId })}>
          <Icon name="open" /> Open its diagram
        </button>
      )}
      {ROLES.map((role) => {
        const arrows = arrowsAt(model, functionId, role);
        return (
          <section key={role} className="role-card" data-role={role}>
            <h3 title={ROLE_HINT[role]}>
              {ROLE_TITLE[role]}
              <span className="count">{arrows.length}</span>
              <span className="spacer" />
              <kbd title={`Press ${ROLE_KEY[role].toUpperCase()} to add one`}>{ROLE_KEY[role].toUpperCase()}</kbd>
            </h3>
            <ul className="end-list">
              {arrows.map((arrow) => (
                <li key={arrow.id}>
                  <button className="link" onClick={() => editor.open(diagramOfFunction(model, functionId), { kind: 'arrow', id: arrow.id })} title="Select this arrow">{arrow.label || '(no label)'}</button>
                  <button className="ghost icon-button small" aria-label={`Remove ${arrow.label} from this function`} title="Remove from this function" onClick={() => editor.run(detachArrow(arrow, functionId, role))}>
                    <Icon name="close" size={14} />
                  </button>
                </li>
              ))}
            </ul>
            <AddArrowRow ref={register(role)} editor={editor} functionId={functionId} role={role} />
          </section>
        );
      })}
    </>
  );
}

function ArrowEditor({ screen, arrowId }: { screen: Screen; arrowId: ArrowId }) {
  const { editor } = screen;
  const { model } = editor;
  const arrow = getArrow(model, arrowId);
  const onDiagram = arrowsOn(model, arrow.diagramId);
  const index = onDiagram.indexOf(arrow);
  const [targetKey, setTargetKey] = useState<string>();
  const [sourceKey, setSourceKey] = useState<string>();
  const register = useFocusRequests(screen);

  // Ends the arrow does not have yet. A second boundary end is never offered: an arrow crosses the frame once per direction.
  const hasBoundaryTarget = arrow.targets.some((t) => t.kind === 'boundary');
  const targets = targetChoices(model, arrow.diagramId).filter((c) =>
    c.end.kind === 'boundary' ? !hasBoundaryTarget : !arrow.targets.some((t) => t.kind === 'function' && c.end.kind === 'function' && t.functionId === c.end.functionId && t.role === c.end.role),
  );
  const sources = sourceChoices(model, arrow.diagramId, 'input').filter(
    (c) => c.end.kind === 'function' && !arrow.sources.some((s) => s.kind === 'function' && c.end.kind === 'function' && s.functionId === c.end.functionId),
  );
  const target = targets.find((c) => c.key === targetKey) ?? targets[0];
  const source = sources.find((c) => c.key === sourceKey) ?? sources[0];

  return (
    <>
      <header className="inspector-header">
        <span className="kind-chip">Arrow</span>
        <span className="spacer" />
        <button className="ghost icon-button" disabled={index <= 0} onClick={() => editor.run(moveArrow({ id: arrowId, toIndex: index - 1 }))} aria-label="Move earlier" title="Move earlier among this diagram's arrows; changes the order along a box side and the ICOM codes">
          <Icon name="up" />
        </button>
        <button className="ghost icon-button" disabled={index >= onDiagram.length - 1} onClick={() => editor.run(moveArrow({ id: arrowId, toIndex: index + 1 }))} aria-label="Move later" title="Move later among this diagram's arrows">
          <Icon name="down" />
        </button>
        <button className="ghost icon-button danger" onClick={() => editor.run(deleteArrow({ id: arrowId }))} aria-label="Delete arrow" title="Delete this arrow (Del)">
          <Icon name="trash" />
        </button>
      </header>
      <label className="field">
        <span>Label</span>
        <TextField fieldRef={register('label')} value={arrow.label} label="Arrow label" placeholder="A noun phrase, such as Approved Request" onCommit={(label) => editor.run(renameArrow({ id: arrowId, label }))} />
      </label>
      <DefinitionField screen={screen} term={arrow.label} register={register('definition')} />
      <section className="role-card">
        <h3>From <span className="count">{arrow.sources.length}</span></h3>
        <ul className="end-list">
          {arrow.sources.map((s, i) => (
            <li key={i}>
              <span>{describeSource(model, arrow, s)}</span>
              {arrow.sources.length > 1 && (
                <button className="ghost icon-button small" aria-label="Remove this source" title="Remove this source" onClick={() => editor.run(removeArrowSource({ id: arrowId, index: i }))}>
                  <Icon name="close" size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
        {source && (
          <div className="add-row is-single">
            <EndSelect choices={sources} value={source.key} onChange={setSourceKey} label="Another source" />
            <button onClick={() => editor.run(addArrowSource({ id: arrowId, source: source.end }))} title="The arrow joins from this function as well">Add source</button>
          </div>
        )}
      </section>
      <section className="role-card">
        <h3>To <span className="count">{arrow.targets.length}</span></h3>
        <ul className="end-list">
          {arrow.targets.map((t, i) => (
            <li key={i}>
              <span>{describeTarget(model, arrow, t)}</span>
              {arrow.targets.length > 1 && (
                <button className="ghost icon-button small" aria-label="Remove this target" title="Remove this target" onClick={() => editor.run(removeArrowTarget({ id: arrowId, index: i }))}>
                  <Icon name="close" size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
        {target && (
          <div className="add-row is-single">
            <EndSelect choices={targets} value={target.key} onChange={setTargetKey} label="Another target" />
            <button onClick={() => editor.run(addArrowTarget({ id: arrowId, target: target.end }))} title="The arrow branches to this end as well">Add target</button>
          </div>
        )}
      </section>
    </>
  );
}

function ParentArrowEditor({ screen, arrowId }: { screen: Screen; arrowId: ArrowId }) {
  const { model, state } = screen.editor;
  const parent = inheritedBoundary(model, state.diagramId).find((p) => p.parentArrowId === arrowId);
  if (!parent) return <p className="empty">This arrow belongs to another diagram.</p>;
  const menu = parentArrowMenu(model, state.diagramId, arrowId);
  return (
    <>
      <header className="inspector-header">
        <span className="kind-chip">Parent arrow</span>
        <h2>{parent.code}</h2>
      </header>
      <p className="parent-label" data-role={parent.role}><span className="role-dot" />{parent.label || '(no label)'}</p>
      <p className="hint">
        This arrow touches the parent box as {parent.role === 'input' || parent.role === 'output' ? 'an' : 'a'} {parent.role}, so it must appear on this diagram. It is <strong>{parent.state}</strong> here.
      </p>
      <div className="menu-inline" role="group" aria-label="Parent arrow actions">
        {menu.map((entry, i) =>
          entry.kind === 'heading' ? (
            <h3 key={i}>{entry.label}</h3>
          ) : entry.kind === 'item' ? (
            <button key={i} className="wide" disabled={entry.disabled === true} onClick={() => screen.act(entry.action)}>{entry.label}</button>
          ) : null,
        )}
      </div>
    </>
  );
}

const INFO_FIELDS: readonly { key: keyof ModelInfo; title: string; multiline?: boolean; placeholder: string }[] = [
  { key: 'name', title: 'Model name', placeholder: 'What this model is called' },
  { key: 'purpose', title: 'Purpose', multiline: true, placeholder: 'Why the model exists and what question it answers' },
  { key: 'viewpoint', title: 'Viewpoint', multiline: true, placeholder: 'Whose view of the system this is' },
  { key: 'context', title: 'Context', multiline: true, placeholder: 'What is inside and outside the boundary' },
  { key: 'numberPrefix', title: 'Diagram number prefix', placeholder: 'For example CC, giving CC-01' },
];

function ModelDetails({ screen }: { screen: Screen }) {
  const { editor } = screen;
  const { info } = editor.model;
  return (
    <>
      <header className="inspector-header">
        <span className="kind-chip">Model</span>
        <h2>Details</h2>
      </header>
      <p className="tip"><Icon name="info" /><span>Select a box or an arrow to edit it. Double-click a box to open its diagram, or right-click anything for its actions.</span></p>
      {INFO_FIELDS.map((field) => (
        <label className="field" key={field.key}>
          <span>{field.title}</span>
          <TextField value={info[field.key]} label={field.title} placeholder={field.placeholder} multiline={field.multiline === true} onCommit={(value) => editor.run(updateInfo({ [field.key]: value }))} />
        </label>
      ))}
    </>
  );
}

export function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}
