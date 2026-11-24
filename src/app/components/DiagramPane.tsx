import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { getFunction } from '../../domain';
import type { DrawnDiagram } from '../composition';
import { menuFor } from '../editor/contextMenu';
import type { Selection } from '../editor/editorState';
import type { Screen } from '../useScreen';
import { Icon } from './Icon';

interface View {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

const MIN_SCALE = 0.2;
const MAX_SCALE = 4;
/** A press that moves less than this is a click, not a pan. */
const CLICK_SLOP = 4;
/** Room left around a fitted drawing, and under it for the zoom controls. */
const FIT_MARGIN = 28;

/** CSS that recolours the selected element inside the rendered SVG; the SVG itself is never edited. */
function highlightCss(selection: Selection): string {
  if (selection.kind === 'none') return '';
  const id = CSS.escape(selection.id);
  if (selection.kind === 'function') return `.canvas [data-function-id="${id}"] rect { stroke: var(--paper-accent); stroke-width: 3; fill: var(--paper-selected); }`;
  const arrow = `.canvas [data-arrow-id="${id}"]`;
  return `${arrow} path:not([stroke="transparent"]) { stroke: var(--paper-accent); stroke-width: 2.2; } ${arrow} polygon, ${arrow} text { fill: var(--paper-accent); }`;
}

/** The live diagram: the drawing with pan and zoom, and any layout warnings. */
export function DiagramPane({ screen, drawn, error }: { screen: Screen; drawn: DrawnDiagram | undefined; error: string | undefined }) {
  const { editor, workspace } = screen;
  const { model, state } = editor;
  const viewport = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
  const drag = useRef<{ startX: number; startY: number; origin: View; moved: boolean }>();
  const size = drawn?.geometry.size;

  const fit = useCallback((): void => {
    const box = viewport.current?.getBoundingClientRect();
    if (!box || !size) return;
    const scale = Math.min(1, (box.width - 2 * FIT_MARGIN) / size.width, (box.height - 2 * FIT_MARGIN) / size.height);
    setView({ scale, x: (box.width - size.width * scale) / 2, y: (box.height - size.height * scale) / 2 });
  }, [size]);

  // Fit when another diagram opens, the drawing first appears or a fit is asked for; not on every edit, so the view stays put while working.
  const ready = size !== undefined;
  useLayoutEffect(fit, [state.diagramId, ready, workspace.state.fitRequests]);

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
  const zoomCentre = (factor: number): void => {
    const box = viewport.current?.getBoundingClientRect();
    if (box) zoomAt(box.left + box.width / 2, box.top + box.height / 2, factor);
  };

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

  /** The model element under the pointer, read from the ids the renderer wrote into the drawing. */
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
  const onContextMenu = (event: MouseEvent): void => {
    if (!drawn) return;
    event.preventDefault();
    const picked = pick(event);
    // The menu acts on what is under the pointer, so that becomes the selection, as in any editor.
    if (picked.kind !== 'none') editor.select(picked);
    screen.showMenu({ x: event.clientX, y: event.clientY }, 'Diagram actions', menuFor(model, state.diagramId, picked));
  };

  const defects = drawn?.geometry.defects ?? [];

  return (
    <section className="diagram" aria-label="Diagram">
      {defects.length > 0 && (
        <div className="banner is-warning" role="status">
          <Icon name="warning" />
          <span><strong>Layout warning.</strong> The automatic layout could not avoid: {defects.map((d) => d.message).join('; ')}.</span>
        </div>
      )}
      <div className="canvas-viewport" ref={viewport} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onClick={onClick} onDoubleClick={onDoubleClick} onContextMenu={onContextMenu}>
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
      <div className="zoom-controls" role="group" aria-label="Zoom">
        <button className="ghost icon-button" onClick={() => zoomCentre(1 / 1.25)} aria-label="Zoom out" title="Zoom out"><Icon name="minus" /></button>
        <button className="ghost zoom-level" onClick={() => zoomCentre(1 / view.scale)} title="Zoom to 100%">{Math.round(view.scale * 100)}%</button>
        <button className="ghost icon-button" onClick={() => zoomCentre(1.25)} aria-label="Zoom in" title="Zoom in"><Icon name="plus" /></button>
        <span className="divider" />
        <button className="ghost icon-button" onClick={fit} aria-label="Fit to window" title="Fit to window"><Icon name="fit" /></button>
      </div>
    </section>
  );
}
