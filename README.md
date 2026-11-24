# IDEF0 Diagram Creator

A tool that turns a model of functions and their inputs, controls, outputs and
mechanisms (ICOMs) into rule-correct IDEF0 diagrams, with no manual drawing.
The design is in [docs/design-spec.md](docs/design-spec.md).

## Status

Milestones 1 to 3 of the design spec are in place:

- **Domain model** with commands, undo and redo, and JSON save and load. The
  reference model in `examples/change_control_model.json` imports cleanly.
- **SVG renderer** ported from the reference pack's `idef0.py`.
- **Layout pipeline**: staircase box placement, side slots ordered to avoid
  crossings, boundary arrows drawn as rakes with shared trunks, and
  obstacle-avoiding routing through libavoid. On all four reference diagrams
  no arrow passes through a box and no two arrows share a line.

Labels are still placed at fixed spots and collide on the busier diagrams;
label placement and the quality gate are milestone 4. The browser app is a
read-only preview of the reference model for now; the editor is milestone 5.

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
| `src/theme` | Every visual style value | nothing |
| `src/geometry` | Plain layout output: rectangles, polylines, text anchors | `theme` |
| `src/layout` | The pipeline of stages from model to geometry, and the `Router` interface | `domain`, `geometry`, `theme` |
| `src/render` | Geometry to SVG string | `geometry`, `theme` |
| `src/app` | The shell that picks concrete implementations, and the React UI | everything |

### Extending it

| To add | Do this |
| --- | --- |
| An edit | Write a function that returns `defineCommand(...)` in `src/domain/commands` |
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
