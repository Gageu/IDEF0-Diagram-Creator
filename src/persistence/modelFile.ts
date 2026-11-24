/** The tool's own save format: the model as JSON with a format tag and version. */
import { assertIntegrity, DomainError, type Model } from '../domain';

export const MODEL_FILE_FORMAT = 'idef0-model';
export const MODEL_FILE_VERSION = 1;

export class ModelFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelFileError';
  }
}

export function serializeModel(model: Model): string {
  const file = {
    format: MODEL_FILE_FORMAT,
    version: MODEL_FILE_VERSION,
    info: model.info,
    rootId: model.rootId,
    functions: model.functions,
    arrows: model.arrows,
    glossary: model.glossary,
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}

type Json = Record<string, unknown>;

function object(value: unknown, where: string): Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ModelFileError(`${where} must be an object`);
  }
  return value as Json;
}

function array(value: unknown, where: string): unknown[] {
  if (!Array.isArray(value)) throw new ModelFileError(`${where} must be a list`);
  return value;
}

function string(value: unknown, where: string): string {
  if (typeof value !== 'string') throw new ModelFileError(`${where} must be text`);
  return value;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], where: string): T {
  if (!allowed.includes(value as T)) throw new ModelFileError(`${where} must be one of: ${allowed.join(', ')}`);
  return value as T;
}

const ENTRY_ROLES = ['input', 'control', 'mechanism'] as const;

function parseLink(value: unknown, where: string, withRole: boolean) {
  const link = object(value, where);
  const kind = oneOf(link.kind, ['inherited', 'split', 'external', 'tunneled'] as const, `${where}.kind`);
  if (kind === 'inherited' || kind === 'split') {
    return { kind, parentArrowId: string(link.parentArrowId, `${where}.parentArrowId`) };
  }
  return withRole ? { kind, role: oneOf(link.role, ENTRY_ROLES, `${where}.role`) } : { kind };
}

function parseEnd(value: unknown, where: string, direction: 'source' | 'target') {
  const end = object(value, where);
  const kind = oneOf(end.kind, ['function', 'boundary'] as const, `${where}.kind`);
  if (kind === 'boundary') return { kind, link: parseLink(end.link, `${where}.link`, direction === 'source') };
  const functionId = string(end.functionId, `${where}.functionId`);
  return direction === 'source'
    ? { kind, functionId }
    : { kind, functionId, role: oneOf(end.role, ENTRY_ROLES, `${where}.role`) };
}

/** Reads a saved model. Throws `ModelFileError` with the location of the first problem. */
export function parseModel(text: string): Model {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new ModelFileError(`Not valid JSON: ${(error as Error).message}`);
  }
  const file = object(raw, 'file');
  if (file.format !== MODEL_FILE_FORMAT) throw new ModelFileError(`Not an ${MODEL_FILE_FORMAT} file`);
  if (file.version !== MODEL_FILE_VERSION) {
    throw new ModelFileError(`Unsupported file version ${String(file.version)}; this build reads version ${MODEL_FILE_VERSION}`);
  }
  const info = object(file.info, 'info');
  const model = {
    info: {
      name: string(info.name, 'info.name'),
      purpose: string(info.purpose, 'info.purpose'),
      viewpoint: string(info.viewpoint, 'info.viewpoint'),
      context: string(info.context, 'info.context'),
      numberPrefix: string(info.numberPrefix, 'info.numberPrefix'),
    },
    rootId: string(file.rootId, 'rootId'),
    functions: Object.fromEntries(
      Object.entries(object(file.functions, 'functions')).map(([id, value]) => {
        const fn = object(value, `functions.${id}`);
        return [
          id,
          {
            id: string(fn.id, `functions.${id}.id`),
            label: string(fn.label, `functions.${id}.label`),
            children: array(fn.children, `functions.${id}.children`).map((c, i) => string(c, `functions.${id}.children[${i}]`)),
          },
        ];
      }),
    ),
    arrows: array(file.arrows, 'arrows').map((value, i) => {
      const where = `arrows[${i}]`;
      const arrow = object(value, where);
      return {
        id: string(arrow.id, `${where}.id`),
        diagramId: string(arrow.diagramId, `${where}.diagramId`),
        label: string(arrow.label, `${where}.label`),
        sources: array(arrow.sources, `${where}.sources`).map((e, j) => parseEnd(e, `${where}.sources[${j}]`, 'source')),
        targets: array(arrow.targets, `${where}.targets`).map((e, j) => parseEnd(e, `${where}.targets[${j}]`, 'target')),
      };
    }),
    glossary: array(file.glossary, 'glossary').map((value, i) => {
      const entry = object(value, `glossary[${i}]`);
      return { term: string(entry.term, `glossary[${i}].term`), definition: string(entry.definition, `glossary[${i}].definition`) };
    }),
  } as Model;
  try {
    return assertIntegrity(model);
  } catch (error) {
    if (error instanceof DomainError) throw new ModelFileError(`Inconsistent model: ${error.message}`);
    throw error;
  }
}
