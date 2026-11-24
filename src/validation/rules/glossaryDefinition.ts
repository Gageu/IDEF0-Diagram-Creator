import { CONTEXT_DIAGRAM, glossaryTerms } from '../../domain';
import type { Rule } from '../rule';

/**
 * Every function and arrow name has a glossary definition. It is reported
 * once for the whole model, not once per term, so an unfinished glossary
 * does not bury the other findings; the glossary panel shows which terms.
 */
export const glossaryDefinition: Rule = {
  id: 'GLOSSARY',
  title: 'Every term has a definition',
  severity: 'warning',
  check: (model) => {
    const missing = glossaryTerms(model).filter((t) => t.used && t.definition.trim() === '').length;
    if (missing === 0) return [];
    return [{
      diagramId: CONTEXT_DIAGRAM,
      subject: { kind: 'glossary' as const },
      message: `${missing} glossary ${missing === 1 ? 'term has' : 'terms have'} no definition`,
    }];
  },
};
