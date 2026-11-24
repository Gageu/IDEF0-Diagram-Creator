import { useEffect, useMemo, useState } from 'react';
import './app.css';
import { BottomPanel } from './components/BottomPanel';
import { DiagramPane } from './components/DiagramPane';
import { FunctionTree } from './components/FunctionTree';
import { Inspector, isTyping } from './components/Inspector';
import { Toolbar } from './components/Toolbar';
import { createViewDiagram, loadRouter, type DrawnDiagram, type ViewDiagram } from './composition';
import { useEditor, type Editor } from './editor/useEditor';

/** The router's WebAssembly module, served as a static asset by the bundler. */
const routerWasmUrl = new URL('../../node_modules/libavoid-js/dist/libavoid.wasm', import.meta.url).href;

/** Loads the arrow router once; until it arrives there is nothing to draw with. */
function useViewDiagram(): { view: ViewDiagram | undefined; error: string | undefined } {
  const [view, setView] = useState<ViewDiagram>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    let current = true;
    loadRouter(routerWasmUrl).then(
      (router) => current && setView(() => createViewDiagram(router)),
      (reason: unknown) => current && setError(`the arrow router failed to load (${String(reason)})`),
    );
    return () => {
      current = false;
    };
  }, []);
  return { view, error };
}

/** Shortcuts that work anywhere on the screen. Undo and redo stay with the browser while typing in a field. */
function useGlobalShortcuts(editor: Editor): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const command = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (command && key === 's') {
        event.preventDefault();
        editor.saveFile();
      } else if (command && key === 'o') {
        event.preventDefault();
        void editor.openFile();
      } else if (command && key === 'z' && !isTyping(event.target)) {
        event.preventDefault();
        editor.dispatch({ type: event.shiftKey ? 'redo' : 'undo' });
      } else if (command && key === 'y' && !isTyping(event.target)) {
        event.preventDefault();
        editor.dispatch({ type: 'redo' });
      } else if (!command && !event.altKey && key === 'f' && !isTyping(event.target)) {
        event.preventDefault();
        document.querySelector<HTMLButtonElement>('[data-shortcut="f"]')?.click();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editor]);
}

/**
 * The editor screen: function tree, live diagram, editor for the selection,
 * and the checks drawer. It only dispatches commands and shows what the
 * model, layout and validation return.
 */
export function App() {
  const editor = useEditor();
  const { view, error: routerError } = useViewDiagram();
  const { model, state } = editor;
  useGlobalShortcuts(editor);

  const result = useMemo((): { drawn?: DrawnDiagram; error?: string } => {
    if (!view) return {};
    try {
      return { drawn: view(model, state.diagramId) };
    } catch (reason) {
      // A layout failure must not take the editor down: the model can still be fixed or undone.
      return { error: reason instanceof Error ? reason.message : String(reason) };
    }
  }, [view, model, state.diagramId]);

  return (
    <div className="app">
      <Toolbar editor={editor} />
      {state.message !== undefined && (
        <div className="message" role="alert">
          <span>{state.message}</span>
          <button className="icon" aria-label="Dismiss" onClick={() => editor.dispatch({ type: 'dismiss' })}>×</button>
        </div>
      )}
      <FunctionTree editor={editor} />
      <DiagramPane editor={editor} drawn={result.drawn} error={routerError ?? result.error} />
      <Inspector editor={editor} />
      <BottomPanel editor={editor} />
    </div>
  );
}
