import type { Command } from './commands/command';
import type { Model } from './model';

/**
 * Undo and redo over immutable models. Because every command returns a new
 * model, history is a list of earlier models and needs no inverse commands.
 */
export interface History {
  readonly past: readonly Model[];
  readonly present: Model;
  readonly future: readonly Model[];
}

export function createHistory(model: Model): History {
  return { past: [], present: model, future: [] };
}

/** Applies a command. A command that throws leaves the history unchanged. */
export function execute(history: History, command: Command): History {
  const next = command.apply(history.present);
  return { past: [...history.past, history.present], present: next, future: [] };
}

export function canUndo(history: History): boolean {
  return history.past.length > 0;
}

export function canRedo(history: History): boolean {
  return history.future.length > 0;
}

export function undo(history: History): History {
  const previous = history.past[history.past.length - 1];
  if (!previous) return history;
  return { past: history.past.slice(0, -1), present: previous, future: [history.present, ...history.future] };
}

export function redo(history: History): History {
  const [next, ...rest] = history.future;
  if (!next) return history;
  return { past: [...history.past, history.present], present: next, future: rest };
}
