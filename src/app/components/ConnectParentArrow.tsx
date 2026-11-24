import { useState } from 'react';
import { functionsOn, type DiagramId } from '../../domain';
import { connectParentArrow } from '../editor/arrowEntry';
import { describeFunction } from '../editor/describe';
import type { Editor } from '../editor/useEditor';

/** Attaches an unconnected parent arrow to one function on the open diagram. */
export function ConnectParentArrow({ editor, diagramId, parentArrowId }: { editor: Editor; diagramId: DiagramId; parentArrowId: string }) {
  const { model } = editor;
  const functions = functionsOn(model, diagramId);
  const [chosen, setChosen] = useState<string>();
  const functionId = functions.some((f) => f.id === chosen) ? chosen : functions[0]?.id;
  if (functionId === undefined) return null;
  const plan = connectParentArrow(model, diagramId, parentArrowId, functionId);
  return (
    <span className="connect">
      <select value={functionId} onChange={(e) => setChosen(e.target.value)} aria-label="Function to connect to">
        {functions.map((f) => <option key={f.id} value={f.id}>{describeFunction(model, f.id)}</option>)}
      </select>
      <button disabled={plan.kind === 'invalid'} onClick={() => plan.kind !== 'invalid' && editor.run(plan.command)}>Connect</button>
    </span>
  );
}
