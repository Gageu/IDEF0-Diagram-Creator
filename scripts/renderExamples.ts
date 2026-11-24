/** Draws every diagram of the reference model into `examples/out/` and lists any layout defects. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createPipeline, loadRouter, naiveRouter, theme } from '../src/app/composition';
import { diagramIds, diagramNode } from '../src/domain';
import { importReferencePack } from '../src/persistence';
import { renderSvg } from '../src/render/svgRenderer';

const model = importReferencePack(readFileSync('examples/change_control_model.json', 'utf8'));
const pipeline = createPipeline(process.argv.includes('--naive') ? naiveRouter() : await loadRouter());
mkdirSync('examples/out', { recursive: true });
for (const id of diagramIds(model)) {
  const geometry = pipeline.layout(model, id);
  const file = `examples/out/${diagramNode(model, id)}.svg`;
  writeFileSync(file, renderSvg(geometry, theme));
  console.log(`wrote ${file}: ${geometry.defects.length} defects`);
  for (const defect of geometry.defects) console.log(`  ${defect.kind}: ${defect.message}`);
}
