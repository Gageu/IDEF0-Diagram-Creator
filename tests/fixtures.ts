import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Model } from '../src/domain';
import { importReferencePack } from '../src/persistence';

export const referencePackText = readFileSync(
  fileURLToPath(new URL('../examples/change_control_model.json', import.meta.url)),
  'utf8',
);

export function referenceModel(): Model {
  return importReferencePack(referencePackText);
}
