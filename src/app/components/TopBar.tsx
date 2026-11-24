import { useState } from 'react';
import { exporters } from '../../export';
import { canRedoEdit, canUndoEdit, hasUnsavedChanges, NO_SELECTION } from '../editor/editorState';
import type { Screen } from '../useScreen';
import { Icon } from './Icon';
import { MenuButton, Popover, type Anchor, type MenuLine } from './Menu';

const SHORTCUTS: readonly (readonly [keys: string, what: string])[] = [
  ['F', 'Add a function to the open diagram'],
  ['I  C  O  M', 'Add an input, control, output or mechanism to the selected function'],
  ['F2', 'Rename the selection'],
  ['Del', 'Delete the selection'],
  ['Esc', 'Clear the selection'],
  ['Double-click', 'Open a box’s child diagram'],
  ['Right-click', 'Actions for a box, an arrow or the diagram'],
  ['Drag a handle', 'Pull from the handle on a box to another box to connect them'],
  ['Drag a parent arrow', 'Drop it on a box to connect it there'],
  ['Scroll / drag', 'Zoom and pan the diagram'],
  ['Ctrl+Z  Ctrl+Shift+Z', 'Undo and redo'],
  ['Ctrl+S  Ctrl+O', 'Save and open a model file'],
];

/** The bar across the top: the model's name, file and export menus, undo and redo, and the panel switches. */
export function TopBar({ screen }: { screen: Screen }) {
  const { editor, workspace, layout } = screen;
  const { state, model } = editor;
  const [help, setHelp] = useState<Anchor>();
  const [helpOpener, setHelpOpener] = useState<Element>();

  const fileMenu: MenuLine[] = [
    { kind: 'item', label: 'New model', icon: 'file', onSelect: editor.newModel },
    { kind: 'item', label: 'Open…', icon: 'folder', shortcut: 'Ctrl+O', onSelect: () => void editor.openFile() },
    { kind: 'item', label: 'Save', icon: 'save', shortcut: 'Ctrl+S', onSelect: editor.saveFile },
    { kind: 'separator' },
    { kind: 'item', label: 'Load the example model', icon: 'diagram', onSelect: editor.loadExample },
  ];
  // Built from the export registry, so a new exporter shows up here without a change to this file.
  const exportMenu: MenuLine[] = exporters.map((exporter) => ({
    kind: 'item',
    label: exporter.label,
    disabled: !layout,
    onSelect: () => layout && editor.exportWith(exporter, layout),
  }));

  return (
    <header className="topbar">
      <button
        className="ghost icon-button"
        aria-pressed={workspace.state.treeOpen}
        aria-label="Function tree"
        title={workspace.state.treeOpen ? 'Hide the function tree' : 'Show the function tree'}
        onClick={() => workspace.dispatch({ type: 'toggle-panel', panel: 'tree' })}
      >
        <Icon name="panel-left" />
      </button>
      <span className="brand" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22">
          <rect x="1" y="1" width="22" height="22" rx="6" className="brand-tile" />
          <path d="M4 12h4M16 12h4M12 4v4M12 16v4" className="brand-arrows" />
          <rect x="8" y="8.5" width="8" height="7" rx="1" className="brand-box" />
        </svg>
      </span>
      <button className="model-name" title="Edit the model's name, purpose and viewpoint" onClick={() => editor.select(NO_SELECTION)}>
        <span>{model.info.name || 'Untitled model'}</span>
        {hasUnsavedChanges(state) && <span className="unsaved-dot" role="img" aria-label="Unsaved changes" title="Unsaved changes" />}
      </button>

      <span className="spacer" />

      <div className="button-group">
        <button className="ghost icon-button" onClick={() => editor.dispatch({ type: 'undo' })} disabled={!canUndoEdit(state)} aria-label="Undo" title="Undo (Ctrl+Z)">
          <Icon name="undo" />
        </button>
        <button className="ghost icon-button" onClick={() => editor.dispatch({ type: 'redo' })} disabled={!canRedoEdit(state)} aria-label="Redo" title="Redo (Ctrl+Shift+Z)">
          <Icon name="redo" />
        </button>
      </div>
      <span className="divider" />
      <MenuButton lines={fileMenu} label="File" className="ghost">
        File <Icon name="chevron-down" size={14} />
      </MenuButton>
      <button className="ghost" onClick={editor.saveFile} title="Save the model as a JSON file (Ctrl+S)">
        <Icon name="save" /> Save
      </button>
      <MenuButton lines={exportMenu} label="Export" className="primary" title="Export diagrams, the glossary or ICOM tables" align="end">
        <Icon name="download" /> Export <Icon name="chevron-down" size={14} />
      </MenuButton>
      <span className="divider" />
      <button className="ghost icon-button" aria-label="Keyboard shortcuts" title="Keyboard shortcuts" aria-expanded={help !== undefined} onClick={(e) => {
          const below = e.currentTarget.getBoundingClientRect();
          setHelpOpener(e.currentTarget);
          setHelp((open) => (open ? undefined : { below, align: 'end' }));
        }}
      >
        <Icon name="keyboard" />
      </button>
      <button
        className="ghost icon-button"
        aria-pressed={workspace.state.editorOpen}
        aria-label="Editor panel"
        title={workspace.state.editorOpen ? 'Hide the editor panel' : 'Show the editor panel'}
        onClick={() => workspace.dispatch({ type: 'toggle-panel', panel: 'editor' })}
      >
        <Icon name="panel-right" />
      </button>
      {help && (
        <Popover anchor={help} opener={helpOpener} onClose={() => setHelp(undefined)} label="Keyboard shortcuts" className="shortcuts">
          <h2>Shortcuts</h2>
          <dl>
            {SHORTCUTS.map(([keys, what]) => (
              <div key={keys}>
                <dt>{keys.split('  ').map((k) => <kbd key={k}>{k}</kbd>)}</dt>
                <dd>{what}</dd>
              </div>
            ))}
          </dl>
        </Popover>
      )}
    </header>
  );
}
