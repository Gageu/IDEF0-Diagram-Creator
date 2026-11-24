/**
 * The IDEF0 domain model: meaning only, no coordinates.
 *
 * Everything that can be derived from the model (node numbers, ICOM codes,
 * diagram numbers, a child diagram's boundary arrows) is computed in
 * `queries.ts` and never stored here.
 */

export type FunctionId = string;
export type ArrowId = string;

/** The id of the A-0 context diagram, which has no parent function. */
export const CONTEXT_DIAGRAM = '@context';

/**
 * A diagram is identified by the function it decomposes, except the A-0
 * context diagram, which is identified by `CONTEXT_DIAGRAM`.
 */
export type DiagramId = FunctionId | typeof CONTEXT_DIAGRAM;

export const ROLES = ['input', 'control', 'output', 'mechanism'] as const;
export type Role = (typeof ROLES)[number];

/** The roles by which an arrow can enter a function box. */
export type EntryRole = Exclude<Role, 'output'>;

export interface FunctionNode {
  readonly id: FunctionId;
  readonly label: string;
  /** Ordered children. A non-empty list means the function has a child diagram. */
  readonly children: readonly FunctionId[];
}

/**
 * Explains a boundary end by naming the arrow on the parent diagram that it
 * carries into this diagram.
 * - `inherited`: the child arrow is the parent arrow.
 * - `split`: the child arrow is a named sub-category of the parent arrow, so
 *   the parent arrow is a bundle that forks (or joins) at this diagram.
 */
export interface ParentLink {
  readonly kind: 'inherited' | 'split';
  readonly parentArrowId: ArrowId;
}

/**
 * A boundary end with no parent arrow: `external` on the context diagram,
 * or `tunneled` on a child diagram by the user's explicit choice.
 */
export type FreeLinkKind = 'external' | 'tunneled';

/**
 * Why an arrow may start at the diagram boundary. A parent link takes its
 * side from the parent arrow; a free link has no parent arrow and so states
 * its own role.
 */
export type SourceBoundaryLink = ParentLink | { readonly kind: FreeLinkKind; readonly role: EntryRole };

/** Why an arrow may end at the diagram boundary. It always leaves as an output. */
export type TargetBoundaryLink = ParentLink | { readonly kind: FreeLinkKind };

/** An arrow leaves a function as one of its outputs. */
export interface FunctionSource {
  readonly kind: 'function';
  readonly functionId: FunctionId;
}

export interface BoundarySource {
  readonly kind: 'boundary';
  readonly link: SourceBoundaryLink;
}

export interface FunctionTarget {
  readonly kind: 'function';
  readonly functionId: FunctionId;
  readonly role: EntryRole;
}

export interface BoundaryTarget {
  readonly kind: 'boundary';
  readonly link: TargetBoundaryLink;
}

export type ArrowSource = FunctionSource | BoundarySource;
export type ArrowTarget = FunctionTarget | BoundaryTarget;

/**
 * One arrow on one diagram. Several targets is a branch; several sources is
 * a join. The order of arrows in the model breaks ties in the order of arrows
 * along a box side (see `arrowsAt`), which is what ICOM codes follow.
 */
export interface Arrow {
  readonly id: ArrowId;
  readonly diagramId: DiagramId;
  readonly label: string;
  readonly sources: readonly ArrowSource[];
  readonly targets: readonly ArrowTarget[];
}

export interface GlossaryEntry {
  readonly term: string;
  readonly definition: string;
}

export interface ModelInfo {
  readonly name: string;
  readonly purpose: string;
  readonly viewpoint: string;
  readonly context: string;
  /** Prefix of the diagram numbers in the footer, for example "PE" in "PE-02". */
  readonly numberPrefix: string;
}

export interface Model {
  readonly info: ModelInfo;
  /** The single function on the A-0 diagram (node A0). */
  readonly rootId: FunctionId;
  readonly functions: Readonly<Record<FunctionId, FunctionNode>>;
  readonly arrows: readonly Arrow[];
  readonly glossary: readonly GlossaryEntry[];
}

export function createModel(options: {
  rootId?: FunctionId;
  rootLabel: string;
  info?: Partial<ModelInfo>;
}): Model {
  const rootId = options.rootId ?? 'root';
  return {
    info: {
      name: options.rootLabel,
      purpose: '',
      viewpoint: '',
      context: '',
      numberPrefix: 'D',
      ...options.info,
    },
    rootId,
    functions: { [rootId]: { id: rootId, label: options.rootLabel, children: [] } },
    arrows: [],
    glossary: [],
  };
}
