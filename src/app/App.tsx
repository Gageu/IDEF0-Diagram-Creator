import { useEffect, useMemo, useState } from 'react';
import examplePack from '../../examples/change_control_model.json?raw';
import { CONTEXT_DIAGRAM, diagramIds, diagramNode, diagramTitle, type DiagramId } from '../domain';
import { importReferencePack } from '../persistence';
import { createDrawDiagram, loadRouter, type DrawDiagram } from './composition';

/** The router's WebAssembly module, served as a static asset by the bundler. */
const routerWasmUrl = new URL('../../node_modules/libavoid-js/dist/libavoid.wasm', import.meta.url).href;

/**
 * A preview of the reference model, one diagram at a time. It exists to show
 * the model, layout and renderer working end to end in the browser; the
 * editor described in the design spec replaces it in a later milestone.
 */
export function App() {
  const model = useMemo(() => importReferencePack(examplePack), []);
  const [diagramId, setDiagramId] = useState<DiagramId>(CONTEXT_DIAGRAM);
  const [draw, setDraw] = useState<DrawDiagram>();
  const [loadError, setLoadError] = useState<string>();

  useEffect(() => {
    let current = true;
    loadRouter(routerWasmUrl).then(
      (router) => current && setDraw(() => createDrawDiagram(router)),
      (error: unknown) => current && setLoadError(String(error)),
    );
    return () => {
      current = false;
    };
  }, []);

  const svg = useMemo(() => draw?.(model, diagramId), [draw, model, diagramId]);

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
      {loadError !== undefined && <p role="alert">The arrow router failed to load: {loadError}</p>}
      {svg === undefined && loadError === undefined && <p>Loading the arrow router…</p>}
      {/* The SVG comes from our own renderer, which escapes all model text. */}
      {svg !== undefined && <div style={{ overflow: 'auto', border: '1px solid #ccc' }} dangerouslySetInnerHTML={{ __html: svg }} />}
    </main>
  );
}
