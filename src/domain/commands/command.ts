import { assertIntegrity } from '../integrity';
import type { Model } from '../model';

/**
 * One edit to the model. `apply` is pure: it returns a new model and leaves
 * the old one untouched, or throws a `DomainError` when the edit is invalid.
 * This is the only way the rest of the app changes a model.
 */
export interface Command {
  /** Short text for an undo menu, for example "Add function". */
  readonly description: string;
  apply(model: Model): Model;
}

/** Builds a command whose result is always checked against the model invariants. */
export function defineCommand(description: string, change: (model: Model) => Model): Command {
  return {
    description,
    apply: (model) => assertIntegrity(change(model)),
  };
}

/** Several commands as one edit, so they undo together. If any fails, none is applied. */
export function batch(description: string, commands: readonly Command[]): Command {
  return {
    description,
    apply: (model) => commands.reduce((current, command) => command.apply(current), model),
  };
}

export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const result = [...items];
  const [item] = result.splice(from, 1);
  result.splice(Math.max(0, Math.min(to, result.length)), 0, item as T);
  return result;
}
