import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './Icon';

/** Where a popup opens: at a point (a right-click), or under an element (a menu button). */
export type Anchor = { readonly x: number; readonly y: number } | { readonly below: DOMRect; readonly align?: 'start' | 'end' };

const MARGIN = 8;

/**
 * A floating panel above the page. It keeps itself inside the window and
 * closes on Escape, on a press anywhere outside it, and when the window
 * changes under it.
 */
export function Popover(props: {
  anchor: Anchor;
  onClose(): void;
  label: string;
  className?: string;
  role?: string;
  /** The button that opened the panel. A press on it is left to the button, which closes the panel itself. */
  opener?: Element | null | undefined;
  onKeyDown?(event: KeyboardEvent<HTMLDivElement>): void;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number }>();
  const { anchor, onClose, opener } = props;

  useLayoutEffect(() => {
    const box = panel.current?.getBoundingClientRect();
    if (!box) return;
    const wanted = 'below' in anchor
      ? { left: anchor.align === 'end' ? anchor.below.right - box.width : anchor.below.left, top: anchor.below.bottom + 4 }
      : { left: anchor.x, top: anchor.y };
    // Flip above a point when there is no room below; otherwise slide back inside the window.
    const top = 'x' in anchor && wanted.top + box.height > window.innerHeight - MARGIN ? anchor.y - box.height : wanted.top;
    setPosition({
      left: Math.max(MARGIN, Math.min(wanted.left, window.innerWidth - box.width - MARGIN)),
      top: Math.max(MARGIN, Math.min(top, window.innerHeight - box.height - MARGIN)),
    });
  }, [anchor]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent): void => {
      const inside = event.target instanceof Node && (panel.current?.contains(event.target) || opener?.contains(event.target));
      if (!inside) onClose();
    };
    const onKey = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onClose);
    window.addEventListener('blur', onClose);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose, opener]);

  return createPortal(
    <div
      ref={panel}
      className={`popover ${props.className ?? ''}`}
      role={props.role ?? 'dialog'}
      aria-label={props.label}
      // Transparent, not hidden, until it is placed: a hidden panel could not take the keyboard focus.
      style={{ left: position?.left ?? 0, top: position?.top ?? 0, opacity: position ? 1 : 0 }}
      onKeyDown={props.onKeyDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      {props.children}
    </div>,
    document.body,
  );
}

/** One line of a menu as the screen draws it. */
export type MenuLine =
  | { readonly kind: 'item'; readonly label: string; onSelect(): void; readonly shortcut?: string; readonly disabled?: boolean; readonly danger?: boolean; readonly icon?: IconName }
  | { readonly kind: 'heading'; readonly label: string }
  | { readonly kind: 'separator' };

/** A menu of actions. Arrow keys move between the items that are available; choosing one closes the menu. */
export function PopupMenu({ lines, anchor, label, onClose, opener }: { lines: readonly MenuLine[]; anchor: Anchor; label: string; onClose(): void; opener?: Element | null | undefined }) {
  const list = useRef<HTMLDivElement>(null);
  const returnTo = useRef(document.activeElement);

  const items = (): HTMLButtonElement[] => [...(list.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
  useEffect(() => {
    items()[0]?.focus();
    const opener = returnTo.current;
    // Hand the keyboard back to where it was, unless choosing an item moved it somewhere on purpose.
    return () => {
      if (opener instanceof HTMLElement && (document.activeElement === document.body || list.current?.contains(document.activeElement))) opener.focus();
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const all = items();
    const at = all.indexOf(document.activeElement as HTMLButtonElement);
    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (step !== 0 && all.length > 0) {
      event.preventDefault();
      all[(at + step + all.length) % all.length]!.focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      all[event.key === 'Home' ? 0 : all.length - 1]?.focus();
    } else if (event.key === 'Tab') {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <Popover anchor={anchor} onClose={onClose} opener={opener} className="menu" role="menu" label={label} onKeyDown={onKeyDown}>
      <div ref={list}>
        {lines.map((line, i) =>
          line.kind === 'separator' ? (
            <div key={i} className="menu-separator" role="separator" />
          ) : line.kind === 'heading' ? (
            <div key={i} className="menu-heading">{line.label}</div>
          ) : (
            <button
              key={i}
              role="menuitem"
              className={`menu-item ${line.danger ? 'is-danger' : ''}`}
              disabled={line.disabled === true}
              onClick={() => {
                onClose();
                line.onSelect();
              }}
            >
              {line.icon && <Icon name={line.icon} />}
              <span className="menu-label">{line.label}</span>
              {line.shortcut !== undefined && <kbd>{line.shortcut}</kbd>}
            </button>
          ),
        )}
      </div>
    </Popover>
  );
}

/** A button that opens a menu under itself. */
export function MenuButton(props: { lines: readonly MenuLine[]; label: string; className?: string; title?: string; align?: 'start' | 'end'; children: ReactNode }) {
  const [anchor, setAnchor] = useState<Anchor>();
  const button = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={button}
        className={props.className}
        title={props.title}
        aria-haspopup="menu"
        aria-expanded={anchor !== undefined}
        aria-label={props.label}
        onClick={(event) => {
          const below = event.currentTarget.getBoundingClientRect();
          setAnchor((open) => (open ? undefined : { below, align: props.align ?? 'start' }));
        }}
      >
        {props.children}
      </button>
      {anchor && <PopupMenu lines={props.lines} anchor={anchor} label={props.label} opener={button.current} onClose={() => setAnchor(undefined)} />}
    </>
  );
}
