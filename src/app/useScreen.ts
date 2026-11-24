import { useCallback, useMemo, useState } from 'react';
import { exporters } from '../export';
import type { Anchor, MenuLine } from './components/Menu';
import type { LayoutDiagram } from './composition';
import type { MenuAction, MenuEntry } from './editor/contextMenu';
import { useEditor, type Editor } from './editor/useEditor';
import { useWorkspace, type Workspace } from './editor/useWorkspace';

export interface OpenMenu {
  readonly anchor: Anchor;
  readonly label: string;
  readonly lines: readonly MenuLine[];
}

/** Everything a part of the screen needs: the model being edited, how the screen is arranged, and the two ways to act on both. */
export interface Screen {
  readonly editor: Editor;
  readonly workspace: Workspace;
  readonly layout: LayoutDiagram | undefined;
  /** Carries out a menu action. Buttons and keys use it too, so each action behaves the same wherever it starts. */
  act(action: MenuAction): void;
  /** Opens a menu at a point or under an element. */
  showMenu(anchor: Anchor, label: string, entries: readonly MenuEntry[]): void;
  readonly menu: OpenMenu | undefined;
  closeMenu(): void;
}

export function useScreen(layout: LayoutDiagram | undefined): Screen {
  const base = useEditor();
  const workspace = useWorkspace(base.model, base.state);
  const [menu, setMenu] = useState<OpenMenu>();
  const show = workspace.dispatch;

  // Going to a diagram or an element means looking at the diagram, whichever view was showing.
  const editor = useMemo<Editor>(
    () => ({
      ...base,
      open: (diagramId, select) => {
        show({ type: 'show', view: 'diagram' });
        base.open(diagramId, select);
      },
      select: (selection) => {
        show({ type: 'show', view: 'diagram' });
        base.select(selection);
      },
    }),
    [base, show],
  );

  const act = useCallback(
    (action: MenuAction): void => {
      switch (action.type) {
        case 'run':
          if (action.then) show({ type: 'show', view: 'diagram' });
          return editor.run(action.command, action.then);
        case 'open':
          return editor.open(action.diagramId, action.select);
        case 'edit':
          editor.open(action.diagramId, action.selection);
          return show({ type: 'focus', field: action.field });
        case 'fit':
          return show({ type: 'fit' });
        case 'export': {
          const exporter = exporters.find((e) => e.id === action.exporterId);
          if (exporter && layout) editor.exportWith(exporter, layout);
        }
      }
    },
    [editor, show, layout],
  );

  const showMenu = useCallback(
    (anchor: Anchor, label: string, entries: readonly MenuEntry[]): void => {
      if (entries.length === 0) return;
      setMenu({ anchor, label, lines: entries.map((entry): MenuLine => (entry.kind === 'item' ? { ...entry, onSelect: () => act(entry.action) } : entry)) });
    },
    [act],
  );
  const closeMenu = useCallback(() => setMenu(undefined), []);

  return useMemo(() => ({ editor, workspace, layout, act, showMenu, menu, closeMenu }), [editor, workspace, layout, act, showMenu, menu, closeMenu]);
}
