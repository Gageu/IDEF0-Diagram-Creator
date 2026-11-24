import { forwardRef, useMemo, useState, type FormEvent } from 'react';
import { arrowsOn, diagramOfFunction, type FunctionId, type Role } from '../../domain';
import { otherEndChoices, planArrowEntry } from '../editor/arrowEntry';
import type { Editor } from '../editor/useEditor';
import { EndSelect } from './EndSelect';

/**
 * The quick-add row under one side of a function: a label, the other end,
 * Enter. Focus stays in the label box afterwards so several arrows can be
 * typed in a row. Typing an existing arrow's label branches that arrow.
 */
export const AddArrowRow = forwardRef<HTMLInputElement, { editor: Editor; functionId: FunctionId; role: Role }>(function AddArrowRow({ editor, functionId, role }, labelInput) {
  const { model } = editor;
  const [label, setLabel] = useState('');
  const [chosenKey, setChosenKey] = useState<string>();
  const choices = useMemo(() => otherEndChoices(model, functionId, role), [model, functionId, role]);
  const other = choices.find((c) => c.key === chosenKey) ?? choices[0];
  const plan = planArrowEntry(model, { functionId, role, label, other });
  const existingLabels = useMemo(() => [...new Set(arrowsOn(model, diagramOfFunction(model, functionId)).map((a) => a.label))], [model, functionId]);
  const listId = `labels-${functionId}-${role}`;

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (plan.kind === 'invalid') return;
    editor.run(plan.command);
    setLabel('');
  };
  // Say what will happen whenever it is not the plain case of a new arrow.
  const hint = plan.kind === 'branch' || plan.kind === 'join' ? plan.description : label !== '' && plan.kind === 'invalid' ? plan.reason : undefined;

  return (
    <form className="add-row" onSubmit={submit}>
      <input
        ref={labelInput}
        type="text"
        value={label}
        list={listId}
        placeholder={other?.defaultLabel ?? `New ${role}`}
        aria-label={`Label of the new ${role}`}
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && e.currentTarget.blur()}
      />
      <datalist id={listId}>{existingLabels.map((l) => <option key={l} value={l} />)}</datalist>
      <EndSelect choices={choices} value={other?.key} onChange={setChosenKey} label={role === 'output' ? 'Where it goes' : 'Where it comes from'} />
      <button type="submit" disabled={plan.kind === 'invalid'}>Add</button>
      {hint !== undefined && <p className="hint">{hint}</p>}
    </form>
  );
});
