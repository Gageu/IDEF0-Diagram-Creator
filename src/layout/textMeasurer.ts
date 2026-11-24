import type { TextStyle } from '../theme/theme';

/**
 * Measures text without drawing it. Layout depends on this interface so it
 * can run in Node; a browser build could supply a canvas-based measurer.
 */
export interface TextMeasurer {
  width(text: string, style: TextStyle): number;
}

// Advance widths of Helvetica / Arial / Liberation Sans in 1/1000 em, for printable ASCII from space.
const ASCII_WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833,
  722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556,
  556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334,
  260, 334, 584,
];
const FALLBACK_WIDTH = 600;
/** Bold glyphs of these faces run about this much wider than regular ones. */
const BOLD_FACTOR = 1.07;

/** Estimates widths from a metrics table; close enough to size boxes and space labels. */
export const approximateTextMeasurer: TextMeasurer = {
  width(text, style) {
    let units = 0;
    for (const char of text) units += ASCII_WIDTHS[char.charCodeAt(0) - 32] ?? FALLBACK_WIDTH;
    return (units / 1000) * style.fontSize * (style.bold ? BOLD_FACTOR : 1);
  },
};
