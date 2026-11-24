import type { Rule } from './rule';
import { boxCount } from './rules/boxCount';
import { controlAndOutput } from './rules/controlAndOutput';
import { duplicateLabel } from './rules/duplicateLabel';
import { emptyLabel } from './rules/emptyLabel';
import { levelConsistency } from './rules/levelConsistency';
import { verbPhrase } from './rules/verbPhrase';

export * from './rule';
export { looksLikeVerbPhrase } from './rules/verbPhrase';
export { boxCount, controlAndOutput, duplicateLabel, emptyLabel, levelConsistency, verbPhrase };

/**
 * The rule registry. Rules M2 (one box on A-0) and B3 (role matches side)
 * have no entry because the model cannot express a breach of them.
 */
export const idef0Rules: readonly Rule[] = [levelConsistency, controlAndOutput, boxCount, duplicateLabel, verbPhrase, emptyLabel];
