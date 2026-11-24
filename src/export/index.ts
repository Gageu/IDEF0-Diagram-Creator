import type { Exporter } from './exporter';
import { glossaryMarkdown } from './glossaryExporter';
import { icomTableMarkdown } from './icomTableExporter';
import { allDiagramsSvg, currentDiagramSvg } from './svgExporter';

export * from './exporter';
export { crc32, zipFiles, type ZipEntry } from './zip';
export { allDiagramsSvg, currentDiagramSvg, glossaryMarkdown, icomTableMarkdown };

/** The export registry. The export menu is built from this list. */
export const exporters: readonly Exporter[] = [currentDiagramSvg, allDiagramsSvg, glossaryMarkdown, icomTableMarkdown];
