import { arrowsAt, diagramIds, diagramNode, diagramTitle, functionsOn, nodeNumber, ROLES } from '../domain';
import { markdownCell, safeFileName, type Exporter } from './exporter';

/** One Markdown table per diagram: each function with its inputs, controls, outputs and mechanisms. */
export const icomTableMarkdown: Exporter = {
  id: 'icom-markdown',
  label: 'ICOM tables (Markdown)',
  export: ({ model }) => {
    const sections = diagramIds(model).map((diagramId) => {
      const rows = functionsOn(model, diagramId).map((fn) => {
        const cells = ROLES.map((role) => arrowsAt(model, fn.id, role).map((a) => markdownCell(a.label)).join('; '));
        return `| ${nodeNumber(model, fn.id)} ${markdownCell(fn.label)} | ${cells.join(' | ')} |`;
      });
      return [
        `## ${diagramNode(model, diagramId)} ${diagramTitle(model, diagramId)}`,
        '',
        '| Function | Inputs | Controls | Outputs | Mechanisms |',
        '| --- | --- | --- | --- | --- |',
        ...rows,
        '',
      ].join('\n');
    });
    const content = [`# ICOM tables: ${model.info.name}`, '', ...sections].join('\n');
    return { files: [{ name: `${safeFileName(model.info.name)}-icom.md`, mimeType: 'text/markdown', content }], skipped: [] };
  },
};
