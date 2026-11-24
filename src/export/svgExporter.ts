import { diagramIds, diagramNode, type DiagramId } from '../domain';
import { safeFileName, type ExportContext, type Exporter, type ExportResult } from './exporter';

function exportDiagrams(context: ExportContext, ids: readonly DiagramId[]): ExportResult {
  const skipped: string[] = [];
  const files = ids.flatMap((id) => {
    const node = diagramNode(context.model, id);
    const reason = context.blockedReason(id);
    if (reason !== undefined) {
      skipped.push(`${node} was not exported: ${reason}`);
      return [];
    }
    return [{ name: `${safeFileName(node)}.svg`, mimeType: 'image/svg+xml', content: context.drawSvg(id) }];
  });
  return { files, skipped };
}

/** The open diagram as one SVG file named after its node, for example `A2.svg`. */
export const currentDiagramSvg: Exporter = {
  id: 'svg-current',
  label: 'This diagram (SVG)',
  export: (context) => exportDiagrams(context, [context.diagramId]),
};

/** Every diagram of the model, one SVG file each, in tree order. */
export const allDiagramsSvg: Exporter = {
  id: 'svg-all',
  label: 'All diagrams (SVG)',
  export: (context) => exportDiagrams(context, diagramIds(context.model)),
};
