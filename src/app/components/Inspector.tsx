import { useEffect, useRef, useState } from 'react';
import {
  addArrowSource,
  addArrowTarget,
  arrowsAt,
  arrowsOn,
  batch,
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
  renameFunction,
  ROLES,
  updateInfo,
  type ArrowId,
  type FunctionId,
  type ModelInfo,
  type Role,
} from '../../domain';
import { detachArrow, sourceChoices, targetChoices } from '../editor/arrowEntry';
import { describeSource, describeTarget, ROLE_TITLE } from '../editor/describe';
import type { Editor } from '../editor/useEditor';
import { AddArrowRow } from './AddArrowRow';
import { ConnectParentArrow } from './ConnectParentArrow';
import { EndSelect } from './EndSelect';
import { TextField } from './TextField';

const ROLE_KEY: Record<Role, string> = { input: 'i', control: 'c', output: 'o', mechanism: 'm' };

/** The editor for whatever is selected: a function, an arrow, a parent arrow, or the model's own details. */
export function Inspector({ editor }: { editor: Editor }) {
  const { selection } = editor.state;
  return (
    <aside className="pane inspector" aria-label="Editor">
      {selection.kind === 'function' && <FunctionEditor key={selection.id} editor={editor} functionId={selection.id} />}
      {selection.kind === 'arrow' && <ArrowEditor key={selection.id} editor={editor} arrowId={selection.id} />}
      {selection.kind === 'parent-arrow' && <ParentArrowEditor editor={editor} arrowId={selection.id} />}
      {selection.kind === 'none' && <ModelDetails editor={editor} />}
    </aside>
  );
}

function FunctionEditor({ editor, functionId }: { editor: Editor; functionId: FunctionId }) {
  const { model } = editor;
  const fn = getFunction(model, functionId);
  const parentId = parentOf(model, functionId);
  const siblings = parentId === undefined ? [] : getFunction(model, parentId).children;
  const index = siblings.indexOf(functionId);
  const addInputs = useRef<Partial<Record<Role, HTMLInputElement | null>>>({});

  // I, C, O and M jump to the matching add row, so arrows can be entered without the mouse.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return;
      const role = ROLES.find((r) => ROLE_KEY[r] === event.key.toLowerCase());
      if (!role) return;
      event.preventDefault();
      addInputs.current[role]?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /** A model that is still named after its top function keeps following that function's name. */
  const rename = (label: string): void => {
    const followsRoot = functionId === model.rootId && model.info.name === fn.label;
    editor.run(followsRoot ? batch('Rename function', [renameFunction({ id: functionId, label }), updateInfo({ name: label })]) : renameFunction({ id: functionId, label }));
  };

  return (
    <>
      <h2>Function {nodeNumber(model, functionId)}</h2>
      <label className="field">
        <span>Name</span>
        <TextField value={fn.label} label="Function name" onCommit={rename} />
      </label>
      <div className="button-row">
        {fn.children.length > 0 && <button onClick={() => editor.open(functionId, { kind: 'function', id: functionId })}>Open diagram</button>}
        <button disabled={index <= 0} onClick={() => editor.run(moveFunction({ id: functionId, toIndex: index - 1 }))} title="Move earlier in the diagram; renumbers the boxes">Earlier</button>
        <button disabled={index < 0 || index >= siblings.length - 1} onClick={() => editor.run(moveFunction({ id: functionId, toIndex: index + 1 }))} title="Move later in the diagram; renumbers the boxes">Later</button>
        <button className="danger" disabled={parentId === undefined} onClick={() => editor.run(deleteFunction({ id: functionId }))} title="Delete this function, its decomposition and its arrows">Delete</button>
      </div>
      {ROLES.map((role) => (
        <section key={role} className="role">
          <h3>
            {ROLE_TITLE[role]} <kbd title={`Press ${ROLE_KEY[role].toUpperCase()} to add one`}>{ROLE_KEY[role].toUpperCase()}</kbd>
          </h3>
          <ul className="end-list">
            {arrowsAt(model, functionId, role).map((arrow) => (
              <li key={arrow.id}>
                <button className="link" onClick={() => editor.open(diagramOfFunction(model, functionId), { kind: 'arrow', id: arrow.id })}>{arrow.label || '(no label)'}</button>
                <button className="icon" aria-label={`Remove ${arrow.label} from this function`} title="Remove from this function" onClick={() => editor.run(detachArrow(arrow, functionId, role))}>×</button>
              </li>
            ))}
          </ul>
          <AddArrowRow ref={(element) => { addInputs.current[role] = element; }} editor={editor} functionId={functionId} role={role} />
        </section>
      ))}
    </>
  );
}

function ArrowEditor({ editor, arrowId }: { editor: Editor; arrowId: ArrowId }) {
  const { model } = editor;
  const arrow = getArrow(model, arrowId);
  const onDiagram = arrowsOn(model, arrow.diagramId);
  const index = onDiagram.indexOf(arrow);
  const [targetKey, setTargetKey] = useState<string>();
  const [sourceKey, setSourceKey] = useState<string>();

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
      <h2>Arrow</h2>
      <label className="field">
        <span>Label</span>
        <TextField value={arrow.label} label="Arrow label" onCommit={(label) => editor.run(renameArrow({ id: arrowId, label }))} />
      </label>
      <div className="button-row">
        <button disabled={index <= 0} onClick={() => editor.run(moveArrow({ id: arrowId, toIndex: index - 1 }))} title="Move earlier among this diagram's arrows; changes the order along a box side and the ICOM codes">Earlier</button>
        <button disabled={index >= onDiagram.length - 1} onClick={() => editor.run(moveArrow({ id: arrowId, toIndex: index + 1 }))} title="Move later among this diagram's arrows">Later</button>
        <button className="danger" onClick={() => editor.run(deleteArrow({ id: arrowId }))}>Delete</button>
      </div>
      <section className="role">
        <h3>From</h3>
        <ul className="end-list">
          {arrow.sources.map((s, i) => (
            <li key={i}>
              <span>{describeSource(model, arrow, s)}</span>
              {arrow.sources.length > 1 && <button className="icon" aria-label="Remove this source" onClick={() => editor.run(removeArrowSource({ id: arrowId, index: i }))}>×</button>}
            </li>
          ))}
        </ul>
        {source && (
          <div className="add-row">
            <EndSelect choices={sources} value={source.key} onChange={setSourceKey} label="Another source" />
            <button onClick={() => editor.run(addArrowSource({ id: arrowId, source: source.end }))} title="The arrow joins from this function as well">Add source</button>
          </div>
        )}
      </section>
      <section className="role">
        <h3>To</h3>
        <ul className="end-list">
          {arrow.targets.map((t, i) => (
            <li key={i}>
              <span>{describeTarget(model, arrow, t)}</span>
              {arrow.targets.length > 1 && <button className="icon" aria-label="Remove this target" onClick={() => editor.run(removeArrowTarget({ id: arrowId, index: i }))}>×</button>}
            </li>
          ))}
        </ul>
        {target && (
          <div className="add-row">
            <EndSelect choices={targets} value={target.key} onChange={setTargetKey} label="Another target" />
            <button onClick={() => editor.run(addArrowTarget({ id: arrowId, target: target.end }))} title="The arrow branches to this end as well">Add target</button>
          </div>
        )}
      </section>
    </>
  );
}

function ParentArrowEditor({ editor, arrowId }: { editor: Editor; arrowId: ArrowId }) {
  const { model, state } = editor;
  const parent = inheritedBoundary(model, state.diagramId).find((p) => p.parentArrowId === arrowId);
  if (!parent) return <p className="empty">This arrow belongs to another diagram.</p>;
  return (
    <>
      <h2>Parent arrow {parent.code}</h2>
      <p><strong>{parent.label}</strong></p>
      <p className="hint">
        This arrow touches the parent box, so it must appear on this diagram. It is {parent.state} here.
      </p>
      {parent.state === 'unconnected' && <ConnectParentArrow editor={editor} diagramId={state.diagramId} parentArrowId={arrowId} />}
    </>
  );
}

const INFO_FIELDS: readonly { key: keyof ModelInfo; title: string; multiline?: boolean }[] = [
  { key: 'name', title: 'Model name' },
  { key: 'purpose', title: 'Purpose', multiline: true },
  { key: 'viewpoint', title: 'Viewpoint', multiline: true },
  { key: 'context', title: 'Context', multiline: true },
  { key: 'numberPrefix', title: 'Diagram number prefix' },
];

function ModelDetails({ editor }: { editor: Editor }) {
  const { info } = editor.model;
  return (
    <>
      <h2>Model details</h2>
      <p className="hint">Select a box or an arrow to edit it. Double-click a box to open its diagram.</p>
      {INFO_FIELDS.map((field) => (
        <label className="field" key={field.key}>
          <span>{field.title}</span>
          <TextField value={info[field.key]} label={field.title} multiline={field.multiline === true} onCommit={(value) => editor.run(updateInfo({ [field.key]: value }))} />
        </label>
      ))}
    </>
  );
}

export function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}
