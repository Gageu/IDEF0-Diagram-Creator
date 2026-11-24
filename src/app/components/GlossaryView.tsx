import { useMemo, useState } from 'react';
import { defineTerm, removeTerm } from '../../domain';
import { filterGlossary, glossaryCounts, glossaryRows, type GlossaryUse } from '../editor/glossaryView';
import type { GlossaryFilter } from '../editor/workspaceState';
import type { Screen } from '../useScreen';
import { Icon } from './Icon';
import { TextField } from './TextField';

const FILTERS: readonly { id: GlossaryFilter; title: string; hint: string }[] = [
  { id: 'all', title: 'All', hint: 'Every term' },
  { id: 'undefined', title: 'Needs a definition', hint: 'Names in the model that have no definition yet' },
  { id: 'unused', title: 'Unused', hint: 'Definitions whose name no function or arrow carries any more' },
];

const EMPTY: Record<GlossaryFilter, string> = {
  all: 'Terms appear here as functions and arrows are named.',
  undefined: 'Every term in the model has a definition.',
  unused: 'No leftover definitions. A definition lands here when its function or arrow is renamed or deleted.',
};

/**
 * The glossary as a page of its own: every function and arrow name with its
 * definition, a search, and a filter for what is still missing. Each term
 * links to where the model uses it.
 */
export function GlossaryView({ screen }: { screen: Screen }) {
  const { editor, workspace, act } = screen;
  const { model } = editor;
  const [query, setQuery] = useState('');
  const rows = useMemo(() => glossaryRows(model), [model]);
  const counts = glossaryCounts(rows);
  const filter = workspace.state.glossaryFilter;
  const shown = filterGlossary(rows, filter, query);
  const countOf: Record<GlossaryFilter, number> = { all: rows.length, undefined: counts.undefined, unused: counts.unused };
  const progress = counts.used === 0 ? 0 : counts.defined / counts.used;

  const goTo = (use: GlossaryUse): void => editor.open(use.diagramId, { kind: use.kind, id: use.id });

  return (
    <section className="glossary" aria-label="Glossary">
      <header className="glossary-header">
        <div className="glossary-title">
          <h2>Glossary</h2>
          <p className="hint">Every function and arrow name in the model. A definition typed here is the same one shown in the editor panel.</p>
        </div>
        <div className="progress" title={`${counts.defined} of ${counts.used} terms defined`}>
          <span className="progress-text"><strong>{counts.defined}</strong> of {counts.used} defined</span>
          <span className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={counts.used} aria-valuenow={counts.defined} aria-label="Terms defined">
            <span className="progress-fill" style={{ width: `${progress * 100}%` }} />
          </span>
        </div>
      </header>
      <div className="glossary-tools">
        <label className="search">
          <Icon name="search" />
          <input type="search" value={query} placeholder="Search terms and definitions" aria-label="Search the glossary" onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setQuery('')} />
        </label>
        <div className="segmented" role="tablist" aria-label="Filter terms">
          {FILTERS.map((f) => (
            <button key={f.id} role="tab" aria-selected={filter === f.id} title={f.hint} onClick={() => workspace.dispatch({ type: 'filter-glossary', filter: f.id })}>
              {f.title} <span className="count">{countOf[f.id]}</span>
            </button>
          ))}
        </div>
        <span className="spacer" />
        <button onClick={() => act({ type: 'export', exporterId: 'glossary-markdown' })} title="Download the glossary as a Markdown table">
          <Icon name="download" /> Export
        </button>
      </div>
      <div className="glossary-list">
        {shown.length === 0 && <p className="empty">{query.trim() !== '' && rows.length > 0 ? `No term matches “${query.trim()}”.` : EMPTY[filter]}</p>}
        {shown.map((row) => (
          <article key={row.term} className={`term is-${row.status}`}>
            <div className="term-name">
              <h3>{row.term}</h3>
              <div className="term-uses">
                {row.uses.map((use) => (
                  <button key={`${use.kind}:${use.id}`} className="use-chip" data-kind={use.kind} onClick={() => goTo(use)} title={use.kind === 'function' ? `Function ${use.node}: show it` : `Arrow on ${use.node}: show it`}>
                    {use.kind === 'function' ? 'Function' : 'Arrow'} · {use.node}
                  </button>
                ))}
                {row.status === 'unused' && (
                  <>
                    <span className="badge is-warning" title="No function or arrow has this name any more. The definition is kept in case the name comes back.">Unused</span>
                    <button className="ghost small danger" title="Remove this leftover definition" onClick={() => editor.run(removeTerm({ term: row.term }))}>
                      <Icon name="trash" size={13} /> Remove
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="term-definition">
              <TextField multiline value={row.definition} label={`Definition of ${row.term}`} placeholder="Add a definition" onCommit={(definition) => editor.run(defineTerm({ term: row.term, definition }))} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
