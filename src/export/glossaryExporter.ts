import { glossaryTerms } from '../domain';
import { markdownCell, safeFileName, type Exporter } from './exporter';

/** The glossary as a Markdown table, terms in alphabetical order. Terms no longer in the model are left out. */
export const glossaryMarkdown: Exporter = {
  id: 'glossary-markdown',
  label: 'Glossary (Markdown)',
  export: ({ model }) => {
    const terms = glossaryTerms(model)
      .filter((t) => t.used)
      .sort((a, b) => a.term.localeCompare(b.term, undefined, { sensitivity: 'base' }));
    const undefinedCount = terms.filter((t) => t.definition.trim() === '').length;
    const lines = [
      `# Glossary: ${model.info.name}`,
      '',
      '| Term | Definition |',
      '| --- | --- |',
      ...terms.map((t) => `| ${markdownCell(t.term)} | ${markdownCell(t.definition)} |`),
      '',
    ];
    return {
      files: [{ name: `${safeFileName(model.info.name)}-glossary.md`, mimeType: 'text/markdown', content: lines.join('\n') }],
      skipped: undefinedCount > 0 ? [`${undefinedCount} ${undefinedCount === 1 ? 'term has' : 'terms have'} no definition yet`] : [],
    };
  },
};
