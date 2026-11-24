import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent, type MutableRefObject, type PointerEvent, type RefObject } from 'react';
import { arrowsOn, diagramOfFunction, inheritedBoundary, type EntryRole, type FunctionId, type Role } from '../../domain';
import type { Point, Rect } from '../../geometry/geometry';
import { otherEndChoices, planArrowEntry } from '../editor/arrowEntry';
import { boxAt, dropParentArrow, droppedChoice, dropRole, type DropBox } from '../editor/connectDrag';
import { describeFunction } from '../editor/describe';
import type { Screen } from '../useScreen';
import { Icon } from './Icon';
import { Popover } from './Menu';
import { TargetSelect } from './TargetSelect';

export interface DiagramView {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

/** A pull shorter than this is a slip of the hand, not a connection. */
const PULL_SLOP = 6;
/** How near a box, in screen pixels, a drop still counts as on it. */
const DROP_MARGIN = 10;
const HANDLE_SIZE = 22;

/** A pull from one box's handle: where the pointer is, in the pane, and what it is over. */
interface Pull {
  readonly fromId: FunctionId;
  /** Where the press landed, to tell a pull from a click. */
  readonly pressed: Point;
  readonly at: Point;
  readonly over: { readonly functionId: FunctionId; readonly role: EntryRole } | undefined;
  /** Set once the button is released: the pull stays drawn while its details are asked for. */
  readonly dropped?: { readonly clientX: number; readonly clientY: number };
}

/** The line along the side of a box where arrows of a role meet it, in pane coordinates. */
function sideLine(rect: Rect, role: Role): { x1: number; y1: number; x2: number; y2: number } {
  const [left, top, right, bottom] = [rect.x, rect.y, rect.x + rect.width, rect.y + rect.height];
  if (role === 'input') return { x1: left, y1: top, x2: left, y2: bottom };
  if (role === 'output') return { x1: right, y1: top, x2: right, y2: bottom };
  if (role === 'control') return { x1: left, y1: top, x2: right, y2: top };
  return { x1: left, y1: bottom, x2: right, y2: bottom };
}

/**
 * The layer over the drawing where arrows are made by dragging. It shows a
 * handle on the box under the pointer; pulling that handle to another box,
 * or to empty space, asks for the new arrow's details. It is also where a
 * parent arrow dragged from the sidebar lands. What each drop means is
 * decided in `editor/connectDrag`; this layer tracks the pointer and draws.
 */
export function ConnectLayer(props: {
  screen: Screen;
  boxes: readonly DropBox[];
  view: DiagramView;
  viewport: RefObject<HTMLDivElement>;
  /** The box the pointer is on or beside, which gets the handle. */
  hoverId: FunctionId | undefined;
  /** Set when a pull ends, so the pane ignores the click that the release also produces. The pane clears it on the next press. */
  suppressClick: MutableRefObject<boolean>;
}) {
  const { screen, view, viewport, hoverId } = props;
  const { editor, workspace } = screen;
  const { model, state } = editor;
  const [pull, setPull] = useState<Pull>();
  const [dropOver, setDropOver] = useState<FunctionId>();
  const draggedId = workspace.state.draggedParentArrow;
  const dragged = draggedId === undefined ? undefined : inheritedBoundary(model, state.diagramId).find((p) => p.parentArrowId === draggedId);

  // Boxes in the pane's own pixels, which is where the pointer is measured and everything here is drawn.
  const boxes = useMemo(
    () => props.boxes.map((b): DropBox => ({ id: b.id, rect: { x: view.x + b.rect.x * view.scale, y: view.y + b.rect.y * view.scale, width: b.rect.width * view.scale, height: b.rect.height * view.scale } })),
    [props.boxes, view],
  );
  const rectOf = (id: FunctionId | undefined): Rect | undefined => boxes.find((b) => b.id === id)?.rect;
  const inPane = (clientX: number, clientY: number): Point => {
    const box = viewport.current?.getBoundingClientRect();
    return { x: clientX - (box?.left ?? 0), y: clientY - (box?.top ?? 0) };
  };

  const pulling = pull !== undefined && pull.dropped === undefined;
  const stopPull = useRef<() => void>();
  useEffect(() => () => stopPull.current?.(), []);

  /**
   * Starts a pull from a box's handle and follows the pointer until the
   * button is released. The listeners go on at once, not after the next
   * render, so that a quick click cannot slip its release past them. The
   * boxes do not move during a pull, so the ones from this render serve it.
   */
  const startPull = (event: PointerEvent, fromId: FunctionId): void => {
    if (event.button !== 0) return;
    // The press belongs to the handle: it must not start a pan or select text.
    event.stopPropagation();
    event.preventDefault();
    const pressed = inPane(event.clientX, event.clientY);
    const others = boxes.filter((b) => b.id !== fromId);
    const home = boxes.filter((b) => b.id === fromId);
    const onMove = (move: globalThis.PointerEvent): void => {
      const at = inPane(move.clientX, move.clientY);
      const target = boxAt(others, at, DROP_MARGIN);
      setPull({ fromId, pressed, at, over: target ? { functionId: target.id, role: dropRole(target.rect, at) } : undefined });
    };
    const onUp = (up: globalThis.PointerEvent): void => {
      stop();
      const at = inPane(up.clientX, up.clientY);
      // The release also produces a click on the pane, which must not change the selection. The pane clears this on the next press.
      props.suppressClick.current = true;
      // Dropping back on the box it came from, or barely moving, calls it off.
      if (boxAt(home, at) !== undefined || Math.hypot(at.x - pressed.x, at.y - pressed.y) < PULL_SLOP) setPull(undefined);
      else setPull((p) => p && { ...p, at, dropped: { clientX: up.clientX, clientY: up.clientY } });
    };
    const onKey = (key: KeyboardEvent): void => {
      if (key.key !== 'Escape') return;
      stop();
      setPull(undefined);
    };
    const stop = (): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey);
      stopPull.current = undefined;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKey);
    stopPull.current = stop;
    setPull({ fromId, pressed, at: pressed, over: undefined });
  };

  const onDragOver = (event: DragEvent): void => {
    if (!dragged) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'link';
    setDropOver(boxAt(boxes, inPane(event.clientX, event.clientY), DROP_MARGIN)?.id);
  };
  const onDrop = (event: DragEvent): void => {
    if (!dragged) return;
    event.preventDefault();
    const target = boxAt(boxes, inPane(event.clientX, event.clientY), DROP_MARGIN);
    setDropOver(undefined);
    workspace.dispatch({ type: 'drag-parent-arrow', id: undefined });
    if (!target) return;
    const plan = dropParentArrow(model, state.diagramId, dragged.parentArrowId, target.id);
    if (plan.kind === 'invalid') editor.dispatch({ type: 'report', message: plan.reason });
    else editor.run(plan.command);
  };

  const hoverRect = pull || dragged ? undefined : rectOf(hoverId);
  const fromRect = rectOf(pull?.fromId);
  const overRect = rectOf(pull?.over?.functionId);
  const start = fromRect && { x: fromRect.x + fromRect.width, y: fromRect.y + fromRect.height / 2 };

  return (
    <div className={`connect-layer ${dragged ? 'is-drop-target' : ''}`} onDragOver={onDragOver} onDragLeave={() => setDropOver(undefined)} onDrop={onDrop}>
      <svg aria-hidden="true">
        {dragged && boxes.map((b) => (
          <g key={b.id} data-role={dragged.role} className={`drop-box ${b.id === dropOver ? 'is-over' : ''}`}>
            <rect x={b.rect.x} y={b.rect.y} width={b.rect.width} height={b.rect.height} />
            <line {...sideLine(b.rect, dragged.role)} />
          </g>
        ))}
        {pull && start && (
          <g className="pull" data-role={pull.over?.role}>
            {overRect && pull.over && (
              <>
                <rect x={overRect.x} y={overRect.y} width={overRect.width} height={overRect.height} />
                <line className="pull-side" {...sideLine(overRect, pull.over.role)} />
              </>
            )}
            <line className="pull-line" x1={start.x} y1={start.y} x2={pull.at.x} y2={pull.at.y} />
            <circle cx={pull.at.x} cy={pull.at.y} r="4" />
          </g>
        )}
      </svg>
      {pulling && pull.over && (
        <span className="pull-chip" data-role={pull.over.role} style={{ left: pull.at.x + 14, top: pull.at.y + 14 }}>
          {pull.over.role} of {describeFunction(model, pull.over.functionId)}
        </span>
      )}
      {pulling && !pull.over && (
        <span className="pull-chip" style={{ left: pull.at.x + 14, top: pull.at.y + 14 }}>Drop on a box, or here to leave the diagram</span>
      )}
      {hoverRect && hoverId !== undefined && (
        <button
          className="connect-handle"
          style={{ left: hoverRect.x + hoverRect.width + 3, top: hoverRect.y + hoverRect.height / 2 - HANDLE_SIZE / 2 }}
          aria-label="Pull to connect"
          title="Drag to another function to connect them"
          onPointerDown={(event) => startPull(event, hoverId)}
          onClick={(event) => event.stopPropagation()}
        >
          <Icon name="chevron-right" size={14} />
        </button>
      )}
      {pull?.dropped && (
        <NewArrowPopover screen={screen} fromId={pull.fromId} drop={pull.over} anchor={{ x: pull.dropped.clientX, y: pull.dropped.clientY }} onClose={() => setPull(undefined)} />
      )}
    </div>
  );
}

/** The details of an arrow that was just pulled out: its label, and where it goes and as what, starting from where it was dropped. */
function NewArrowPopover(props: { screen: Screen; fromId: FunctionId; drop: { functionId: FunctionId; role: EntryRole } | undefined; anchor: { x: number; y: number }; onClose(): void }) {
  const { editor } = props.screen;
  const { model } = editor;
  const { fromId } = props;
  const choices = useMemo(() => otherEndChoices(model, fromId, 'output'), [model, fromId]);
  const [label, setLabel] = useState('');
  const [chosenKey, setChosenKey] = useState(() => droppedChoice(choices, props.drop)?.key);
  const other = choices.find((c) => c.key === chosenKey) ?? choices[0];
  const plan = planArrowEntry(model, { functionId: fromId, role: 'output', label, other });
  const existingLabels = useMemo(() => [...new Set(arrowsOn(model, diagramOfFunction(model, fromId)).map((a) => a.label))], [model, fromId]);
  const hint = plan.kind === 'branch' || plan.kind === 'join' ? plan.description : label !== '' && plan.kind === 'invalid' ? plan.reason : undefined;

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (plan.kind === 'invalid') return;
    editor.run(plan.command);
    props.onClose();
  };

  return (
    <Popover anchor={props.anchor} onClose={props.onClose} label="New arrow" className="new-arrow">
      <form onSubmit={submit}>
        <h2>New arrow</h2>
        <p className="hint">An output of {describeFunction(model, fromId)}</p>
        <label className="field">
          <span>Label</span>
          <input type="text" autoFocus value={label} list="new-arrow-labels" placeholder={other?.defaultLabel ?? 'A noun phrase, such as Approved Request'} aria-label="Label of the new arrow" onChange={(e) => setLabel(e.target.value)} />
          <datalist id="new-arrow-labels">{existingLabels.map((l) => <option key={l} value={l} />)}</datalist>
        </label>
        <TargetSelect model={model} choices={choices} value={other?.key} onChange={setChosenKey} />
        {hint !== undefined && <p className="hint">{hint}</p>}
        <div className="dialog-buttons">
          <button type="button" onClick={props.onClose}>Cancel</button>
          <button type="submit" className="primary" disabled={plan.kind === 'invalid'}>Create arrow</button>
        </div>
      </form>
    </Popover>
  );
}
