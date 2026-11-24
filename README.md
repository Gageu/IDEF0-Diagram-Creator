# IDEF0 Diagram Creator

A tool that turns a model of functions and their inputs, controls, outputs and
mechanisms (ICOMs) into rule-correct IDEF0 diagrams, with no manual drawing.
The design is in [docs/design-spec.md](docs/design-spec.md).

## Status

Milestones 1 to 5 of the design spec are in place:

- **Domain model** with commands, undo and redo, and JSON save and load. The
  reference model in `examples/change_control_model.json` imports cleanly.
- **Validation**: each IDEF0 rule is one object in a registry. Errors (a
  parent arrow missing from the child diagram, a function with no control or
  no output) and warnings (box count outside 3 to 6, duplicate labels, names
  that are not verb phrases, empty labels) each point at their element.
- **Layout pipeline**: staircase box placement, side slots ordered to avoid
  crossings, rakes with shared trunks, obstacle-avoiding routing through
  libavoid, label placement, and a quality gate that retries with more room
  until the drawing has no defects.
- **SVG renderer** ported from the reference pack's `idef0.py`.
- **Editor**: a function tree, the live diagram with pan and zoom, an editor
  for the selected function or arrow, and a drawer with rule violations and
  the open diagram's inherited arrows.

SVG export of all diagrams and the glossary panel are milestone 6.

## Using the editor

`npm run dev` opens the editor on the reference model. **New** starts an empty
model; work in progress is kept in the browser across reloads, and **Save**
writes a JSON file that **Open** reads back.

- Click a box, an arrow or a label to select it. Double-click a box to open
  its child diagram; the breadcrumb goes back up.
- With a function selected, press `I`, `C`, `O` or `M` to jump to the add row
  for inputs, controls, outputs or mechanisms. Type a label, pick the other
  end, press Enter. Focus stays in the row for the next arrow.
- Typing the label of an arrow that is already on the diagram branches that
  arrow to the function instead of adding a duplicate.
- **Decompose** gives the selected function a child diagram. Its parent
  arrows appear dashed at the frame until they are connected, from the
  **Inherited arrows** tab or by clicking the dashed arrow.
- `F` adds a function, `Ctrl+Z` and `Ctrl+Shift+Z` undo and redo, `Ctrl+S`
  saves.

## Getting started

Requires Node 20 or newer.

```sh
npm install
npm run dev              # preview in the browser
npm test                 # unit, layout and architecture tests
npm run typecheck
npm run render:examples  # write every reference diagram to examples/out/
                         # (add -- --naive to compare with the naive router)
```

## How the code is organised

Data flows one way, and each module imports only from the modules listed for
it. `tests/architecture.test.ts` enforces this table.

| Module | Job | May import |
| --- | --- | --- |
| `src/domain` | The model, queries for derived values, commands, history | nothing |
| `src/persistence` | The save format and the reference pack importer | `domain` |
| `src/validation` | The `Rule` interface and one file per IDEF0 rule | `domain` |
| `src/theme` | Every visual style value | nothing |
| `src/geometry` | Plain layout output: rectangles, polylines, text anchors | `theme` |
| `src/layout` | The pipeline of stages from model to geometry, and the `Router` interface | `domain`, `geometry`, `theme` |
| `src/render` | Geometry to SVG string | `geometry`, `theme` |
| `src/app` | The shell that picks concrete implementations, and the React UI | everything |

### Extending it

| To add | Do this |
| --- | --- |
| An edit | Write a function that returns `defineCommand(...)` in `src/domain/commands` |
| A rule | Implement `Rule` in `src/validation/rules` and add it to `idef0Rules` in `src/validation/index.ts` |
| A layout stage | Implement `LayoutStage` and add it to the list in `src/app/composition.ts` |
| A router | Implement `Router`, run `describeRouterContract` on it in a test, and swap it in `composition.ts` (`libavoidRouter.ts` is the worked example) |
| A different look | Pass another `Theme` or `LayoutOptions` in `composition.ts` |

### Model notes

- The model stores meaning only. Node numbers (A0, A21), diagram numbers,
  ICOM codes and a child diagram's boundary arrows are all derived in
  `src/domain/queries.ts`.
- Every arrow end at a diagram boundary says why it may be there: `external`
  (context diagram), `inherited` from a parent arrow, a `split` of a parent
  arrow into a named sub-arrow, or `tunneled`. An unexplained boundary arrow
  cannot be stored.
- The order of arrows along a box side follows a convention that avoids
  crossings (see `arrowsAt`), and ICOM codes follow the same order. Model
  order breaks ties, and `moveArrow` changes it.
