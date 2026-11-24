import type { ModelInfo } from '../model';
import { defineCommand, type Command } from './command';

export function updateInfo(patch: Partial<ModelInfo>): Command {
  return defineCommand('Edit model details', (model) => ({ ...model, info: { ...model.info, ...patch } }));
}

/** Sets the definition of a glossary term, adding the entry when it is new. */
export function defineTerm(args: { term: string; definition: string }): Command {
  return defineCommand('Define glossary term', (model) => {
    const exists = model.glossary.some((e) => e.term === args.term);
    const glossary = exists
      ? model.glossary.map((e) => (e.term === args.term ? { ...e, definition: args.definition } : e))
      : [...model.glossary, { term: args.term, definition: args.definition }];
    return { ...model, glossary };
  });
}

export function removeTerm(args: { term: string }): Command {
  return defineCommand('Remove glossary term', (model) => ({
    ...model,
    glossary: model.glossary.filter((e) => e.term !== args.term),
  }));
}
