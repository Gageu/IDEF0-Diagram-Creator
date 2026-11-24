/**
 * Every visual style value in one place, taken from part 2 of the rules and
 * style spec in the reference pack. Layout reads the text styles to measure
 * labels; the renderer reads everything to draw.
 */

export interface TextStyle {
  readonly fontSize: number;
  readonly bold: boolean;
  /** Distance between the baselines of consecutive lines. */
  readonly lineHeight: number;
}

export const TEXT_STYLE_NAMES = ['boxLabel', 'boxNumber', 'arrowLabel', 'icomCode', 'note', 'footerCaption', 'footerValue'] as const;
export type TextStyleName = (typeof TEXT_STYLE_NAMES)[number];

export interface Theme {
  readonly fontFamily: string;
  readonly ink: string;
  readonly paper: string;
  readonly text: Readonly<Record<TextStyleName, TextStyle>>;
  readonly box: { readonly strokeWidth: number; readonly numberInset: number };
  readonly arrow: {
    readonly strokeWidth: number;
    readonly bendRadius: number;
    readonly headLength: number;
    readonly headHalfWidth: number;
    /** Dash pattern of a parent arrow that is not connected on this diagram yet. */
    readonly unconnectedDash: string;
  };
  /** The parentheses of a tunneled arrow: distance from the frame to each one (clear of an arrowhead there), and their half height. */
  readonly tunnel: { readonly near: number; readonly far: number; readonly halfHeight: number };
  readonly leader: { readonly strokeWidth: number };
  readonly frame: { readonly strokeWidth: number };
  readonly footer: {
    readonly height: number;
    readonly nodeCellWidth: number;
    readonly numberCellWidth: number;
    readonly textInset: number;
    readonly captionBaseline: number;
    readonly valueBaseline: number;
  };
}

export const referenceTheme: Theme = {
  fontFamily: 'Liberation Sans, Arial, Helvetica, sans-serif',
  ink: '#000',
  paper: '#fff',
  text: {
    boxLabel: { fontSize: 14, bold: true, lineHeight: 16 },
    boxNumber: { fontSize: 11, bold: true, lineHeight: 13 },
    arrowLabel: { fontSize: 12, bold: false, lineHeight: 14 },
    icomCode: { fontSize: 11, bold: true, lineHeight: 14 },
    note: { fontSize: 11, bold: false, lineHeight: 15 },
    footerCaption: { fontSize: 10, bold: false, lineHeight: 12 },
    footerValue: { fontSize: 15, bold: true, lineHeight: 18 },
  },
  box: { strokeWidth: 1.6, numberInset: 5 },
  arrow: { strokeWidth: 1.3, bendRadius: 8, headLength: 10, headHalfWidth: 4.5, unconnectedDash: '6 4' },
  tunnel: { near: 14, far: 26, halfHeight: 6 },
  leader: { strokeWidth: 0.8 },
  frame: { strokeWidth: 1 },
  footer: { height: 44, nodeCellWidth: 170, numberCellWidth: 200, textInset: 8, captionBaseline: 15, valueBaseline: 34 },
};
