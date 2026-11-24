/**
 * The contract every IDEF0 rule implements. A rule is one small object, kept
 * in a list, so adding a rule is one new file and one line in the registry,
 * and no rule knows about any other.
 */
import type { ArrowId, DiagramId, FunctionId, Model } from '../domain';

export type Severity = 'error' | 'warning';

/** The element a violation points at, so a viewer can select it. */
export type ViolationSubject =
  | { readonly kind: 'diagram' }
  | { readonly kind: 'glossary' }
  | { readonly kind: 'function'; readonly functionId: FunctionId }
  | { readonly kind: 'arrow'; readonly arrowId: ArrowId }
  /** An arrow on the parent diagram that this diagram should carry in or out. */
  | { readonly kind: 'parent-arrow'; readonly arrowId: ArrowId };

export interface Finding {
  /** The diagram the problem shows on. */
  readonly diagramId: DiagramId;
  readonly subject: ViolationSubject;
  readonly message: string;
}

export interface Rule {
  /** The rule's number in the reference pack's rules spec, for example "M5". */
  readonly id: string;
  readonly title: string;
  readonly severity: Severity;
  check(model: Model): Finding[];
}

export interface Violation extends Finding {
  readonly ruleId: string;
  readonly severity: Severity;
}

/** Runs every rule over the model. Errors come first, then diagrams in tree order. */
export function validate(model: Model, rules: readonly Rule[]): Violation[] {
  const violations = rules.flatMap((rule) => rule.check(model).map((finding) => ({ ...finding, ruleId: rule.id, severity: rule.severity })));
  return violations.sort((a, b) => Number(b.severity === 'error') - Number(a.severity === 'error'));
}

/** Errors block export of the diagram they are on; warnings do not. */
export function blocksExport(violations: readonly Violation[], diagramId: DiagramId): boolean {
  return violations.some((v) => v.severity === 'error' && v.diagramId === diagramId);
}
