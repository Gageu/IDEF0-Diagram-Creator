import { useMemo, useState } from 'react';
import examplePack from '../../examples/change_control_model.json?raw';
import { CONTEXT_DIAGRAM, diagramIds, diagramNode, diagramTitle, type DiagramId } from '../domain';
import { importReferencePack } from '../persistence';
import { drawDiagram } from './composition';

/**
 * A preview of the reference model, one diagram at a time. It exists to show
 * the model, layout and renderer working end to end in the browser; the
 * editor described in the design spec replaces it in a later milestone.
 */
export function App() {
  const model = useMemo(() => importReferencePack(examplePack), []);
  const [diagramId, setDiagramId] = useState<DiagramId>(CONTEXT_DIAGRAM);
  const svg = useMemo(() => drawDiagram(model, diagramId), [model, diagramId]);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', margin: 16 }}>
      <h1 style={{ fontSize: 18 }}>{model.info.name}</h1>
      <nav style={{ display: 'flex', gap: 8, marginBottom: 12 }} aria-label="Diagrams">
        {diagramIds(model).map((id) => (
          <button key={id} onClick={() => setDiagramId(id)} aria-pressed={id === diagramId} style={{ fontWeight: id === diagramId ? 'bold' : 'normal' }}>
            {diagramNode(model, id)} {diagramTitle(model, id)}
          </button>
        ))}
      </nav>
      {/* The SVG comes from our own renderer, which escapes all model text. */}
      <div style={{ overflow: 'auto', border: '1px solid #ccc' }} dangerouslySetInnerHTML={{ __html: svg }} />
    </main>
  );
}
