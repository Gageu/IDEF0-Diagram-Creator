import type { EndChoice } from '../editor/arrowEntry';

/** A dropdown of arrow ends, grouped into functions and boundary. */
export function EndSelect<End>(props: { choices: readonly EndChoice<End>[]; value: string | undefined; onChange(key: string): void; label: string }) {
  const group = (name: EndChoice<End>['group']) => {
    const members = props.choices.filter((c) => c.group === name);
    if (members.length === 0) return null;
    return (
      <optgroup label={name}>
        {members.map((c) => <option key={c.key} value={c.key}>{c.text}</option>)}
      </optgroup>
    );
  };
  return (
    <select value={props.value ?? ''} onChange={(e) => props.onChange(e.target.value)} aria-label={props.label} title={props.label}>
      {group('Boundary')}
      {group('Functions')}
    </select>
  );
}
