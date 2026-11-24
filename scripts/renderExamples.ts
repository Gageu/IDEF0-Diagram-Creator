/** Draws every diagram of the reference model into `examples/out/` for a visual check. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { drawDiagram } from '../src/app/composition';
import { diagramIds, diagramNode } from '../src/domain';
import { importReferencePack } from '../src/persistence';

const model = importReferencePack(readFileSync('examples/change_control_model.json', 'utf8'));
mkdirSync('examples/out', { recursive: true });
for (const id of diagramIds(model)) {
  const file = `examples/out/${diagramNode(model, id)}.svg`;
  writeFileSync(file, drawDiagram(model, id));
  console.log(`wrote ${file}`);
}
