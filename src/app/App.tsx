import { useEffect, useMemo, useState } from 'react';
import './styles/index.css';
import { diagramNode, diagramTitle } from '../domain';
import { DiagramPane } from './components/DiagramPane';
import { FunctionTree } from './components/FunctionTree';
import { GlossaryView } from './components/GlossaryView';
import { Icon } from './components/Icon';
import { Inspector, isTyping } from './components/Inspector';
import { PopupMenu } from './components/Menu';
import { ParentArrows } from './components/ParentArrows';
import { StatusBar } from './components/StatusBar';
import { TopBar } from './components/TopBar';
import { ViolationsPanel } from './components/ViolationsPanel';
import { createLayoutDiagram, createViewDiagram, loadRouter, type DrawnDiagram, type LayoutDiagram } from './composition';
import { diagramPath } from './editor/describe';
import { NO_SELECTION } from './editor/editorState';
import { addFunctionStep, deleteSelectionCommand } from './editor/functionActions';
import { glossaryCounts, glossaryRows } from './editor/glossaryView';
import { useScreen, type Screen } from './useScreen';

/** The router's WebAssembly module, served as a static asset by the bundler. */
const routerWasmUrl = new URL('../../node_modules/libavoid-js/dist/libavoid.wasm', import.meta.url).href;

/** Loads the arrow router once; until it arrives there is nothing to draw with. */
function useLayoutDiagram(): { layout: LayoutDiagram | undefined; error: string | undefined } {
  const [layout, setLayout] = useState<LayoutDiagram>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    let current = true;
    loadRouter(routerWasmUrl).then(
      (router) => current && setLayout(() => createLayoutDiagram(router)),
      (reason: unknown) => current && setError(`the arrow router failed to load (${String(reason)})`),
    );
    return () => {
      current = false;
    };
  }, []);
  return { layout, error };
}

/** Shortcuts that work anywhere on the screen. While typing in a field, the keys belong to the field. */
function useGlobalShortcuts(screen: Screen): void {
  useEffect(() => {
    const { editor, workspace, act } = screen;
    const { model, state } = editor;
    const onKey = (event: KeyboardEvent): void => {
      const command = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      const typing = isTyping(event.target);
      const done = (): void => event.preventDefault();
      if (command && key === 's') {
        done();
        editor.saveFile();
      } else if (command && key === 'o') {
        done();
        void editor.openFile();
      } else if (typing || event.altKey || screen.menu) {
        return;
      } else if (command && key === 'z') {
        done();
        editor.dispatch({ type: event.shiftKey ? 'redo' : 'undo' });
      } else if (command && key === 'y') {
        done();
        editor.dispatch({ type: 'redo' });
      } else if (command) {
        return;
      } else if (key === 'f') {
        done();
        act({ type: 'run', ...addFunctionStep(model, state.diagramId) });
      } else if (key === 'f2' && (state.selection.kind === 'function' || state.selection.kind === 'arrow')) {
        done();
        workspace.dispatch({ type: 'focus', field: 'label' });
      } else if (key === 'delete' || key === 'backspace') {
        const remove = deleteSelectionCommand(model, state.selection);
        if (!remove) return;
        done();
        editor.run(remove);
      } else if (key === 'escape' && state.selection.kind !== 'none') {
        editor.dispatch({ type: 'select', selection: NO_SELECTION });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen]);
}

/** The header of the centre pane: the two views as tabs, and the way back up from the open diagram. */
function WorkspaceHeader({ screen }: { screen: Screen }) {
  const { editor, workspace } = screen;
  const { model, state } = editor;
  const { view } = workspace.state;
  const missing = useMemo(() => glossaryCounts(glossaryRows(model)).undefined, [model]);
  const crumbs = diagramPath(model, state.diagramId);
  return (
    <header className="workspace-header">
      <div className="view-tabs" role="tablist" aria-label="View">
        <button role="tab" aria-selected={view === 'diagram'} onClick={() => workspace.dispatch({ type: 'show', view: 'diagram' })}>
          <Icon name="diagram" /> Diagram
        </button>
        <button role="tab" aria-selected={view === 'glossary'} onClick={() => workspace.dispatch({ type: 'show', view: 'glossary' })}>
          <Icon name="book" /> Glossary
          {missing > 0 && <span className="count is-warning" title={`${missing} terms have no definition`}>{missing}</span>}
        </button>
      </div>
      {view === 'diagram' && (
        <nav className="breadcrumb" aria-label="Diagram path">
          {crumbs.map((id, i) => {
            const here = id === state.diagramId;
            return (
              <span key={id} className="crumb">
                {i > 0 && <Icon name="chevron-right" size={12} />}
                <button onClick={() => editor.open(id)} disabled={here} aria-current={here ? 'page' : undefined} title={diagramTitle(model, id)}>
                  <span className="crumb-node">{diagramNode(model, id)}</span>
                  {here && <span className="crumb-title">{diagramTitle(model, id)}</span>}
                </button>
              </span>
            );
          })}
        </nav>
      )}
    </header>
  );
}

/**
 * The editor screen: function tree, the diagram or the glossary, the editor
 * panel for the selection, and the status bar. It only dispatches commands
 * and shows what the model, layout and validation return.
 */
export function App() {
  const { layout, error: routerError } = useLayoutDiagram();
  const screen = useScreen(layout);
  const { editor, workspace } = screen;
  const { model, state } = editor;
  const view = useMemo(() => (layout ? createViewDiagram(layout) : undefined), [layout]);
  useGlobalShortcuts(screen);

  const result = useMemo((): { drawn?: DrawnDiagram; error?: string } => {
    if (!view) return {};
    try {
      return { drawn: view(model, state.diagramId) };
    } catch (reason) {
      // A layout failure must not take the editor down: the model can still be fixed or undone.
      return { error: reason instanceof Error ? reason.message : String(reason) };
    }
  }, [view, model, state.diagramId]);

  const { treeOpen, editorOpen, violationsOpen } = workspace.state;
  return (
    <div className={`app ${treeOpen ? '' : 'no-tree'} ${editorOpen ? '' : 'no-editor'}`}>
      <TopBar screen={screen} />
      {treeOpen && (
        <div className="sidebar">
          <FunctionTree screen={screen} />
          <ParentArrows screen={screen} />
        </div>
      )}
      <main className="workspace">
        <WorkspaceHeader screen={screen} />
        {workspace.state.view === 'diagram' ? <DiagramPane screen={screen} drawn={result.drawn} error={routerError ?? result.error} /> : <GlossaryView screen={screen} />}
        {violationsOpen && <ViolationsPanel screen={screen} />}
      </main>
      {editorOpen && <Inspector screen={screen} />}
      <StatusBar screen={screen} />
      {state.message !== undefined && (
        <div className="toast" role="alert">
          <Icon name="error" />
          <span>{state.message}</span>
          <button className="ghost icon-button small" aria-label="Dismiss" onClick={() => editor.dispatch({ type: 'dismiss' })}><Icon name="close" size={14} /></button>
        </div>
      )}
      {screen.menu && <PopupMenu lines={screen.menu.lines} anchor={screen.menu.anchor} label={screen.menu.label} onClose={screen.closeMenu} />}
    </div>
  );
}
