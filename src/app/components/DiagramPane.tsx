import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { diagramNode, getFunction, type DiagramId } from '../../domain';
import type { DrawnDiagram } from '../composition';
import { diagramPath } from '../editor/describe';
import type { Selection } from '../editor/editorState';
import type { Editor } from '../editor/useEditor';

interface View {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

const MIN_SCALE = 0.2;
const MAX_SCALE = 4;
/** A press that moves less than this is a click, not a pan. */
const CLICK_SLOP = 4;
const HIGHLIGHT = '#0b5fd0';

/** CSS that recolours the selected element inside the rendered SVG; the SVG itself is never edited. */
function highlightCss(selection: Selection): string {
  if (selection.kind === 'none') return '';
  const id = CSS.escape(selection.id);
  if (selection.kind === 'function') return `.canvas [data-function-id="${id}"] rect { stroke: ${HIGHLIGHT}; stroke-width: 3; }`;
  const arrow = `.canvas [data-arrow-id="${id}"]`;
  return `${arrow} path:not([stroke="transparent"]) { stroke: ${HIGHLIGHT}; stroke-width: 2.2; } ${arrow} polygon, ${arrow} text { fill: ${HIGHLIGHT}; }`;
}

/** The live diagram: a breadcrumb, the drawing with pan and zoom, and any layout warnings. */
export function DiagramPane({ editor, drawn, error }: { editor: Editor; drawn: DrawnDiagram | undefined; error: string | undefined }) {
  const { model, state } = editor;
  const viewport = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
  const drag = useRef<{ startX: number; startY: number; origin: View; moved: boolean }>();
  const size = drawn?.geometry.size;

  const fit = useCallback((): void => {
    const box = viewport.current?.getBoundingClientRect();
    if (!box || !size) return;
    const scale = Math.min(1, (box.width - 24) / size.width, (box.height - 24) / size.height);
    setView({ scale, x: (box.width - size.width * scale) / 2, y: (box.height - size.height * scale) / 2 });
  }, [size]);

  // Fit when another diagram opens or the drawing first appears, not on every edit, so the view stays put while working.
  const ready = size !== undefined;
  useLayoutEffect(fit, [state.diagramId, ready]);

  const zoomAt = useCallback((clientX: number, clientY: number, factor: number): void => {
    const box = viewport.current?.getBoundingClientRect();
    if (!box) return;
    setView((v) => {
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
      const [px, py] = [clientX - box.left, clientY - box.top];
      // Keep the point under the cursor where it is.
      return { scale, x: px - ((px - v.x) * scale) / v.scale, y: py - ((py - v.y) * scale) / v.scale };
    });
  }, []);

  // React's wheel listener is passive, so the page would scroll; a native one can prevent that.
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      zoomAt(event.clientX, event.clientY, Math.exp(-event.deltaY * 0.0015));
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return;
    drag.current = { startX: event.clientX, startY: event.clientY, origin: view, moved: false };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    const d = drag.current;
    if (!d || event.buttons === 0) return;
    const [dx, dy] = [event.clientX - d.startX, event.clientY - d.startY];
    if (!d.moved && Math.hypot(dx, dy) < CLICK_SLOP) return;
    d.moved = true;
    setView({ ...d.origin, x: d.origin.x + dx, y: d.origin.y + dy });
  };

  /** The model element under a click, read from the ids the renderer wrote into the drawing. */
  const pick = (event: MouseEvent): Selection => {
    const target = event.target instanceof Element ? event.target.closest('[data-function-id], [data-arrow-id]') : null;
    const functionId = target?.getAttribute('data-function-id');
    if (functionId) return { kind: 'function', id: functionId };
    const arrowId = target?.getAttribute('data-arrow-id');
    if (!arrowId) return { kind: 'none' };
    const onThisDiagram = model.arrows.some((a) => a.id === arrowId && a.diagramId === state.diagramId);
    return { kind: onThisDiagram ? 'arrow' : 'parent-arrow', id: arrowId };
  };
  const onClick = (event: MouseEvent): void => {
    if (drag.current?.moved) return;
    editor.select(pick(event));
  };
  const onDoubleClick = (event: MouseEvent): void => {
    const picked = pick(event);
    if (picked.kind === 'function' && getFunction(model, picked.id).children.length > 0) editor.open(picked.id);
  };

  const crumbs = diagramPath(model, state.diagramId);
  const defects = drawn?.geometry.defects ?? [];
  const title = (id: DiagramId): string => diagramNode(model, id);

  return (
    <section className="pane diagram" aria-label="Diagram">
      <div className="diagram-bar">
        <nav className="breadcrumb" aria-label="Diagram path">
          {crumbs.map((id, i) => (
            <span key={id}>
              {i > 0 && <span className="breadcrumb-sep">›</span>}
              <button onClick={() => editor.open(id)} disabled={id === state.diagramId} aria-current={id === state.diagramId ? 'page' : undefined}>
                {title(id)}
              </button>
            </span>
          ))}
        </nav>
        <span className="toolbar-gap" />
        <button onClick={() => { const b = viewport.current?.getBoundingClientRect(); if (b) zoomAt(b.left + b.width / 2, b.top + b.height / 2, 1 / 1.25); }} aria-label="Zoom out">−</button>
        <span className="zoom-level">{Math.round(view.scale * 100)}%</span>
        <button onClick={() => { const b = viewport.current?.getBoundingClientRect(); if (b) zoomAt(b.left + b.width / 2, b.top + b.height / 2, 1.25); }} aria-label="Zoom in">+</button>
        <button onClick={fit}>Fit</button>
      </div>
      {defects.length > 0 && (
        <div className="layout-warning" role="status">
          <strong>Layout warning.</strong> The automatic layout could not avoid: {defects.map((d) => d.message).join('; ')}.
        </div>
      )}
      <div className="canvas-viewport" ref={viewport} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onClick={onClick} onDoubleClick={onDoubleClick}>
        <style>{highlightCss(state.selection)}</style>
        {error !== undefined && <p role="alert" className="canvas-message">This diagram could not be drawn: {error}</p>}
        {drawn === undefined && error === undefined && <p className="canvas-message">Loading the arrow router…</p>}
        {drawn !== undefined && size !== undefined && (
          <div
            className="canvas"
            style={{ width: size.width, height: size.height, transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
            // The SVG comes from our own renderer, which escapes all model text.
            dangerouslySetInnerHTML={{ __html: drawn.svg }}
          />
        )}
      </div>
    </section>
  );
}
