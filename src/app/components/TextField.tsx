import { useEffect, useState, type KeyboardEvent } from 'react';

/**
 * A text input that commits when the user leaves it or presses Enter, and
 * reverts on Escape. Each commit is one undo step, and the diagram is laid
 * out once per edit instead of once per keystroke.
 */
export function TextField(props: { value: string; onCommit(value: string): void; label: string; multiline?: boolean; autoFocus?: boolean }) {
  const [draft, setDraft] = useState(props.value);
  useEffect(() => setDraft(props.value), [props.value]);

  const commit = (): void => {
    if (draft !== props.value) props.onCommit(draft);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && !(props.multiline && event.shiftKey)) {
      event.preventDefault();
      event.currentTarget.blur();
    } else if (event.key === 'Escape') {
      setDraft(props.value);
      event.currentTarget.blur();
    }
  };
  const shared = { value: draft, 'aria-label': props.label, onBlur: commit, onKeyDown, autoFocus: props.autoFocus === true };
  return props.multiline ? (
    <textarea {...shared} rows={3} onChange={(e) => setDraft(e.target.value)} />
  ) : (
    <input {...shared} type="text" onChange={(e) => setDraft(e.target.value)} onFocus={(e) => e.target.select()} />
  );
}
