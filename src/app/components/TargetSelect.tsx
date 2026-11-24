import type { ArrowSource, ArrowTarget, Model } from '../../domain';
import { choiceAt, entryRoleOf, targetPlaces, type EndChoice } from '../editor/arrowEntry';

const ROLE_TEXT = { input: 'Input', control: 'Control', mechanism: 'Mechanism' } as const;

/**
 * Where an arrow goes, asked as two questions: "To" picks a function or a
 * way across the boundary, and "As" picks the role it enters that function
 * by, from the roles still open there. A boundary has no role, so "As" shows
 * only for a function.
 */
export function TargetSelect<End extends ArrowSource | ArrowTarget>(props: { model: Model; choices: readonly EndChoice<End>[]; value: string | undefined; onChange(key: string): void }) {
  const places = targetPlaces(props.model, props.choices);
  const chosen = props.choices.find((c) => c.key === props.value);
  const place = places.find((p) => chosen !== undefined && p.choices.includes(chosen)) ?? places[0];
  const group = (name: EndChoice<End>['group']) => {
    const members = places.filter((p) => p.group === name);
    if (members.length === 0) return null;
    return (
      <optgroup label={name}>
        {members.map((p) => <option key={p.key} value={p.key}>{p.text}</option>)}
      </optgroup>
    );
  };
  const roles = place?.choices.filter((c) => entryRoleOf(c) !== undefined) ?? [];
  return (
    <div className="target-select">
      <label>
        <span>To</span>
        <select
          value={place?.key ?? ''}
          aria-label="Where it goes"
          onChange={(e) => {
            const next = places.find((p) => p.key === e.target.value);
            if (next) props.onChange(choiceAt(next, chosen).key);
          }}
        >
          {group('Boundary')}
          {group('Functions')}
        </select>
      </label>
      {roles.length > 0 && (
        <label>
          <span>As</span>
          <select value={chosen?.key ?? roles[0]!.key} aria-label="The role it enters by" onChange={(e) => props.onChange(e.target.value)}>
            {roles.map((c) => <option key={c.key} value={c.key}>{ROLE_TEXT[entryRoleOf(c)!]}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}
