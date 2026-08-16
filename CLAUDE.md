# CLAUDE.md — Plate Tectonics

Sim-specific context for AI assistants. General SceneryStack guidance: [OpenPhysics/.github/CLAUDE.md](https://github.com/OpenPhysics/.github/blob/main/CLAUDE.md).

## Project

Four screens. **Earth** is an interactive map of the Earth's tectonic plates,
drawn either on a rotatable 3-D globe (the default) or on a pannable flat map;
everything on it is real data — plate model, earthquakes, volcanoes, elevation.
**Crust** and **Plate Motion** are ports of the two tabs of PhET's Java simulation
(`Baseline/PhET/trunk/simulations-java/simulations/plate-tectonics/`), and are
schematic rather than data-driven. **Deep Time** replays a published plate
reconstruction (Müller et al. 2019) from the present day back to Pangaea at 250 Ma —
where the Earth screen extrapolates today's velocities, this one plays back a model
fitted to the geological record.

Changes that affect what is drawn should be checked against
[`doc/model.md`](doc/model.md), which records where each number comes from and what
each screen does not claim.

Forked from [SceneryStackTemplate](https://github.com/OpenPhysics/SceneryStackTemplate).

## Key files

| File | Purpose |
|---|---|
| `src/PlateTectonicsColors.ts` | All `ProfileColorProperty` instances, including the plate palette |
| `src/PlateTectonicsConstants.ts` | Layout px, Earth-science quantities, geological-time range |
| `src/PlateTectonicsNamespace.ts` | Namespace for color property names |
| `src/i18n/StringManager.ts` | Singleton localized string accessor |
| `src/common/EarthProjection.ts` | The interface both projections implement |
| `src/common/MapProjection.ts` | Equirectangular lon/lat ↔ view, plus the flat map's camera |
| `src/common/GlobeProjection.ts` | Orthographic lon/lat ↔ view, plus the globe's camera |
| `src/common/attachGlobeRotation.ts` | Drag and arrow keys → the globe's camera |
| `src/common/attachMapNavigation.ts` | Drag and arrow keys → the flat map's camera |
| `src/common/PlateReconstruction.ts` | Euler-pole rotation, plate velocities, `MOTION_FRAMES` |
| `src/common/data/dataTypes.ts` | Shapes of every dataset (hand-written) |
| `src/common/data/hotspots.ts` | Hand-maintained hotspot list |
| `src/common/data/generated/` | **Generated — do not edit.** `npm run build-data` owns it |
| `src/common/data/generated/motionFrameData.ts` | Rotations belonging to boundaries rather than plates |
| `src/common/data/generated/seafloorAgeData.ts` | Isochrons of the ocean floor, and the ages they are drawn at |
| `src/earth/model/EarthModel.ts` | All AXON state |
| `src/earth/model/EarthquakeDepthFilter.ts` | Depth bands and the filter predicate |
| `src/earth/view/EarthScreenView.ts` | Layout, view switching, `pdomOrder` |
| `src/earth/view/EarthCanvasNode.ts` | The layers both global views share (canvas painting) |
| `src/earth/view/MapCanvasNode.ts` | The flat global map |
| `src/earth/view/GlobeCanvasNode.ts` | The 3-D globe |
| `src/earth/view/PlateOverlayNode.ts` | Plate labels + motion arrows |
| `src/earth/view/LegendSwatches.ts` | Map symbols, shared by legend and checkboxes |
| `src/common/model/ColorMode.ts` | Density / temperature / both, shared by the two schematic screens |
| `src/common/model/SectionViewModel.ts` | Flat section vs 3-D block, and the vertical exaggeration |
| `src/common/model/EarthCurvature.ts` | Planar arc lengths → a point on the sphere (PhET's `convertToRadial`) |
| `src/common/model/Isostasy.ts` | Airy elevation incl. water loading, crustal density, geotherm |
| `src/common/model/EarthStructure.ts` | PREM density table, layer boundaries and temperatures |
| `src/common/model/CrossSectionScale.ts` | Two-band model-metres → view-pixels mapping |
| `src/common/view/EarthMaterial.ts` | The density and temperature colour ramps |
| `src/common/view/ColorModeControlPanel.ts` | The shared "View" panel |
| `src/common/view/MaterialLegendNode.ts` | The ramp legend |
| `src/common/view/EarthProbeNode.ts` | The draggable temperature/density probe |
| `src/common/view/CanvasArrows.ts` | Arrow-heads and flow lines, shared by every painter |
| `src/common/view/SceneCamera.ts` | The 3-D block's perspective projection, and the ray back out |
| `src/common/view/QuadRenderer.ts` | Face collection, depth sort, flat shading — the depth buffer's stand-in |
| `src/common/view/EarthBlockNode.ts` | **The 3-D block**: terrain, end walls, water, front face, camera |
| `src/common/view/TerrainColors.ts` | The elevation ramp on the block's top surface |
| `src/common/view/SectionPlacement.ts` | The one thing labels, the probe and the ruler need from a view |
| `src/common/view/SectionRulerNode.ts` | The draggable ruler |
| `src/crust/view/CrustBlockNode.ts` | The Crust screen's 3-D block |
| `src/plate-motion/view/PlateMotionBlockNode.ts` | The Plate Motion screen's 3-D block |
| `src/crust/model/CrustModel.ts` | Crust screen state; the three floating blocks |
| `src/crust/model/IsostaticRelaxation.ts` | Critically damped settling toward the Airy target |
| `src/crust/view/CrustCanvasNode.ts` | The painted Crust cross-section |
| `src/plate-motion/model/PlateType.ts` | The three plate kinds and their numbers |
| `src/plate-motion/model/BoundaryRules.ts` | What is legal, what happens, which side subducts |
| `src/plate-motion/model/SlabCurve.ts` | Arc-length-parameterised descending slab path |
| `src/plate-motion/model/PlateGeometry.ts` | **The whole behaviour port**: `(motion, plates, t) → shape` |
| `src/plate-motion/model/PlateMotionModel.ts` | The three-state machine and the clock |
| `src/plate-motion/view/PlateMotionCanvasNode.ts` | The painted boundary |
| `src/common/DeepTimeReconstruction.ts` | Slerps a published model's sampled rotations; `IDENTITY_ROTATION_SLOT` |
| `src/common/view/GlobeFeaturePainter.ts` | **Sphere-on-a-disc path work**, shared by both globes |
| `src/common/data/generated/plateHistoryData.ts` | Rotation table + coastlines — the half that moves *continuously* |
| `src/common/data/generated/plateSnapshotData.ts` | Resolved plates and boundaries per 5 Myr — the half that *steps* |
| `src/deep-time/model/DeepTimeModel.ts` | Deep Time state; the 0–250 Ma clock |
| `src/deep-time/view/DeepTimeCanvasNode.ts` | The reconstructed globe |
| `scripts/build-data.ts` | Fetches and reshapes every dataset |
| `scripts/data/` | Fetch cache, GeoTIFF and netCDF readers, geodesy, contouring, emitters |
| `scripts/data/gplates.ts` + `gplates/resolve.py` | Resolves the deep-time model via pyGPlates (build-time only) |

## Working on this sim

### The generated data

`src/common/data/generated/` is written by `npm run build-data` and committed, so
normal builds are offline. Never hand-edit those files. To change what is in them,
change `scripts/build-data.ts` and re-run it; downloads are cached under `.cache/data/`
keyed by URL hash, so re-runs are fast and a changed query parameter re-fetches.

`tests/geophysicalData.test.ts` guards the regeneration: it checks structural
integrity and a few facts about the Earth (deep earthquakes cluster around the
Pacific; the Atlantic isochrons step out symmetrically from the ridge as they get
older). Run `npm test` after any regeneration.

`npm run build-data` with no arguments rebuilds everything. Naming steps —
`plate-model`, `land`, `earthquakes`, `volcanoes`, `seafloor-age`, `relief`,
`plate-history` — rebuilds only those, which is how the PB2002 model can be regenerated
without also pulling a newer earthquake catalogue and a fresh DEM into an unrelated
diff. `plate-model` covers the plates, their boundaries and the motion frames
together, because those three index into each other.

**`plate-history` is the one step that needs Python.** It creates its own virtualenv
under `.cache/gplates/`, installs `pygplates`, downloads the Müller et al. (2019)
model, and resolves 51 instants; the resolved JSON is cached, so re-running to re-tune
simplification is cheap. Nothing about GPlates or Python is needed by `npm run build`,
`npm test` or the shipped sim — they read the committed output like any other dataset.
It also needs `unzip` on the PATH.

### What moves when the clock runs

Only `timeMillionsOfYearsProperty` evolves, and `PlateReconstruction` turns it into a
rotation per **motion frame** — `MOTION_FRAMES` is the plates first (so a plate index
is a frame index) then the rotations derived for the boundaries. Anything inside a
plate rides that plate; a boundary rides the mean of its two plates, or the overriding
plate at a trench; a plate *outline* rides a positional blend of the boundaries near
it, which is what keeps neighbouring plates edge to edge instead of overlapping and
gapping. The rules and their justification are in
[`doc/model.md`](doc/model.md#what-carries-what) — read it before changing what any
feature rides, and note that a frame index is **not** interchangeable with a plate
index outside the first `PLATES.length` entries.

### The three screens

`Earth` and `Deep Time` are data-driven: every feature on their globes is a published
dataset. `Crust` and `Plate Motion` are schematic and compute their own geometry — they
are where the cross-sections live.

**On Deep Time the data comes in two shapes, and the difference is visible.** A
coastline is a static feature cookie-cut by plate ID, so it reconstructs as one rigid
rotation and rides an interpolated rotation table — the continents *glide*. A plate
polygon has no present-day geometry to rotate: it is resolved afresh at each instant,
and plates are born and die, so it is baked per 5 Myr and *steps*. Do not try to
"fix" the stepping by interpolating snapshots — read
[`doc/model.md`](doc/model.md#the-deep-time-screen) first.

**Both globes share `GlobeFeaturePainter`**, which is the sphere-on-a-disc work
(subdividing long segments, cutting at the limb, closing a polygon that runs round the
back). It takes a `SurfaceTransform`, which both `PlateReconstruction` and
`DeepTimeReconstruction` satisfy. Resolved geometry is already at its instant and is
handed `IDENTITY_ROTATION_SLOT` so the painter does not rotate it twice.

**On Plate Motion, time is a parameter, not an integrator.** `PlateGeometry` is a pure
function of elapsed time; nothing accumulates shape. That is what makes Rewind,
step-while-paused and the clock exact, and what makes every claim the screen makes
unit-testable without running a clock. Do not add per-frame mutation to it — see
[`doc/implementation-notes.md`](doc/implementation-notes.md#time-as-a-pure-parameter).

**Both schematic screens draw a 3-D block by default**, with the flat cross-section kept
as a switchable alternative (`SectionViewModel`). The block is rendered in software —
`SceneCamera` projects, `QuadRenderer` sorts faces back to front — rather than with
SceneryStack's `mobius`/three.js, to keep the projection a unit-tested pure function and
three.js out of the bundle. What that costs is a depth buffer and texturing; see
[`doc/implementation-notes.md`](doc/implementation-notes.md#the-3-d-block). **Draw-order
groups in `BLOCK_LAYER` are spaced ten apart** so a subclass can subdivide one — coplanar
faces on the front plane cannot be ordered by depth, so a collision there is a silent
z-order bug.

**Anything drawn over a section goes through `SectionPlacement`**, never through
`CrossSectionScale` directly, or it will be correct in one view and wrong in the other.

**Isostasy is the Crust screen's whole content**, and it deliberately diverges from
PhET in one place: the submarine branch accounts for water loading, which PhET omitted.
The provenance of every constant, including the `AIRY_REFERENCE_OFFSET_M` that PhET left
as a bare `- 3500`, is in [`doc/model.md`](doc/model.md#the-crust-screen).

**`Node` already has `bounds`, `scale()` and `renderer`**, so nodes holding a viewport, a
`CrossSectionScale` or a `QuadRenderer` name those fields `viewBounds`, `sectionScale` and
`faceRenderer`. Shadowing any of them breaks layout or rendering in ways that are hard to
trace.

### Rendering

The global map and the schematic cross-sections are `CanvasNode`s, not trees of
`Path`s, because every feature moves when the reconstruction clock runs — see the
rationale in each file's header and in `doc/implementation-notes.md`. Text stays as Scenery `Text` so it can be
localized and reached by a screen reader.

Sphere-on-a-rectangle hazards (antimeridian wrapping, circumpolar rings, ring closure,
coastlines tearing at plate boundaries, the seams the datasets were cut along) are all
handled in `MapCanvasNode.appendPolyline`. Read its comments before touching it; each
rule is there because of a specific artifact.

The flat map **pans and zooms**, so ±180° is no longer reliably off screen and a
feature is traced relative to the camera rather than to the map's ±180° home. Both
global views therefore carry a camera in the *view*: `MapProjection` has a centre
longitude, a centre latitude and a zoom level, and `MapProjection.latitudeLimit` is
what makes vertical panning do nothing until the user zooms in — a bounded axis, not
an interaction rule. `EarthProjection.project` reports whether a point is on screen,
which on the flat map now means "inside the viewport" as well. The reasoning is in
[`doc/implementation-notes.md`](doc/implementation-notes.md#panning-and-zooming-the-flat-map).

The global map is drawn either flat or as a rotatable 3-D globe, from the same data.
`EarthCanvasNode` owns what they share — which layers exist, in what order, in what
colours — and each subclass supplies only what depends on the shape of the world: the
clip, the base map, and how a polyline of lon/lat becomes a canvas path. Anything that
draws geography (including `PlateOverlayNode`) is written against the `EarthProjection`
interface, whose `project` reports *whether* a point is visible as well as where it
goes. **A new layer added to `EarthCanvasNode` appears on both views for free; one
added to a subclass appears on only one, which is almost never what is wanted.**

Sphere-on-a-disc hazards — cutting at the limb, closing a fill that runs round the
back, 66°-long segments drawn as chords through the Earth, and the antimeridian seams
the dataset was cut along — are all handled in `GlobeCanvasNode`, and documented in
[`doc/implementation-notes.md`](doc/implementation-notes.md). The globe's camera lives
in the *view* (`EarthScreenView` resets it), because it is a camera, not
physics; `showGlobeProperty` is model state because it is a choice about what is shown.

### Colors

Every color is a `ProfileColorProperty` in `PlateTectonicsColors.ts`, including the
eight-entry `platePaletteColorProperties` used to tell neighbouring plates apart.
Canvas painting reads them through `.value.toCSS()`, and the canvas nodes link the
relevant properties so a Projector Mode switch repaints.

Boundary colors (red / cyan / violet) and earthquake-depth colors (yellow → orange →
magenta) have to stay mutually distinguishable *and* readable over the relief raster.
Check both profiles after changing any of them.

`seafloorAgeRampColorProperties` is a five-stop red → blue ramp, interpolated by age
rather than indexed, so the number of isochron ages and the number of color stops are
independent. Its young end deliberately sits near the divergent-boundary red — the
youngest crust *is* the crust at the ridge — and the two are kept apart by line width
and draw order instead of by hue.

## Common components

### PlateTectonicsPanel

Every control panel and info box uses `PlateTectonicsPanel` so default/projector color
switching is automatic:

```typescript
import { PlateTectonicsPanel } from "../../common/PlateTectonicsPanel.js";
const panel = new PlateTectonicsPanel(content, { minWidth: CONTROL_PANEL_WIDTH });
```

### PlateTectonicsButtonOptions

SceneryStack's push/round buttons default to a 3-D look; every button here is flat.
Spread `FLAT_RESET_ALL_BUTTON_OPTIONS`, `FLAT_RECTANGULAR_BUTTON_OPTIONS` or
`FLAT_PLAY_PAUSE_STEP_BUTTON_OPTIONS` into the relevant options object, and use
`PLATE_TECTONICS_COMBO_BOX_OPTIONS` + `LIGHT_SURFACE_TEXT_FILL` for combo boxes.
Anything drawn on a light control surface (checkbox ticks, combo items) must use
`controlSurfaceTextColorProperty`, not `textColorProperty`.

### TimeModel

`EarthModel` composes `TimeModel` for play/pause and elapsed wall-clock time.
The *reconstruction* clock is a separate `timeMillionsOfYearsProperty`, advanced in
`step()` at `millionYearsPerSecond` and clamped to ±50 Myr.

## Accessibility

The three required layers are wired up:

- `EarthScreenSummaryContent` builds a **live** `currentDetails` paragraph
  from the model — globe or flat map, layers, depth filter, geological time.
- Every control has an `accessibleName` from the `a11y` string group; several have
  `accessibleHelpText`.
- `EarthScreenView` sets an explicit `pdomOrder` ending at Reset All, and
  `EarthKeyboardHelpContent` documents sliders, moving the Earth and basic
  actions.

A11y strings live under `a11y.earth` in each locale JSON, exposed via
`StringManager.getEarthA11yStrings()`. Full checklist:
[Baton/ACCESSIBILITY.md](https://github.com/OpenPhysics/Baton/blob/main/ACCESSIBILITY.md).

## Compliance carve-outs

- **Generated data is excluded from Biome** (`biome.json` → `files.includes`). Those
  files are machine-formatted by `scripts/data/emit.ts` to keep numeric arrays compact.
- **Canvas painting instead of Scenery nodes** for the map and the cross-sections, for
  the performance reason above. The interactive controls are all standard sun components.


### `package.json` overrides

JSON cannot carry comments, so the rationale for forced transitive pins lives here. Prefer
**tilde (`~`) or exact** versions — caret (`^`) lets minors drift under what is meant to be a
hard pin. Dependabot ignores these three names (see `.github/dependabot.yml`) so it does not
open PRs that fight the overrides. Revisit when SceneryStack drops or re-pins them upstream.

| Override | Pin | Why |
|---|---|---|
| `lodash` | `~4.18.1` | SceneryStack declares `~4.17.12`. Bump clears Dependabot/npm advisories patched in 4.18.x (e.g. GHSA-r5fr-rjxr-66jc, GHSA-f23m-r3pf-42rh). |
| `three` | `~0.125.2` | SceneryStack declares `^0.104.0`. Floor is 0.125.0 for GHSA-fq6p-x6j3-cmmq (ReDoS). Staying on the 0.125 line avoids a larger API jump; **0.125.x still has open CVEs** (e.g. XSS GHSA-7vvq-7r29-5vg3, fixed only in ≥0.137.0). Remove this override if/when SceneryStack stops depending on `three` or pins a patched line itself. LightPropagation keeps a higher `three` pin — do not force 0.125 there. |
| `brace-expansion` | `~5.0.9` | Transitive via `vite-plugin-pwa` / Workbox. Clears npm audit (originally GHSA-mh99-v99m-4gvg; keep ≥5.0.9 for GHSA-rgw5-rvv9-x895). |

## Testing

| Path | Purpose |
|---|---|
| `tests/PlateReconstruction.test.ts` | Euler-pole rotation; plate speeds against published values |
| `tests/DeepTimeReconstruction.test.ts` | Deep time as claims about the Earth: India's drift, Pangaea at 250 Ma, the identity row |
| `tests/PlateEvolution.test.ts` | The mosaic staying closed; what each boundary rides; plate areas |
| `tests/EarthModel.test.ts` | Layer state, depth bands, time clock, reset |
| `tests/MapProjection.test.ts` | Projection round trips, 2:1 viewport, motion-arrow bearings |
| `tests/GlobeProjection.test.ts` | Orthographic projection and its inverse, visibility, bearings, camera |
| `tests/geophysicalData.test.ts` | Integrity of the generated datasets |
| `tests/Isostasy.test.ts` | Airy elevation, both branches, and the density expression |
| `tests/EarthStructure.test.ts` | PREM profile and the layer boundaries built on it |
| `tests/CrossSectionScale.test.ts` | Two-band mapping, monotonicity, round trips |
| `tests/EarthCurvature.test.ts` | The bend onto the sphere, and its inverse |
| `tests/SceneCamera.test.ts` | Perspective projection, picking ray, framing solver |
| `tests/QuadRenderer.test.ts` | Depth sort, layer override, culling, flat shading |
| `tests/EarthBlockNode.test.ts` | The block's projection and its front-face inverse |
| `tests/TerrainColors.test.ts` | The elevation ramp on the block's surface |
| `tests/SectionPlacement.test.ts` | Both views agreeing about what a section point means |
| `tests/SectionRulerNode.test.ts` | Tick numbering and the ruler surviving a section that gives it no room |
| `tests/EarthMaterial.test.ts` | The two colour ramps and the combined mode |
| `tests/IsostaticRelaxation.test.ts` | Convergence, no overshoot, frame-rate independence |
| `tests/CrustModel.test.ts` | Slider → density → elevation chain, probe, reset |
| `tests/BoundaryRules.test.ts` | All 9 pairings × 2 motions; which side subducts |
| `tests/SlabCurve.test.ts` | Arc continuity and arc-length parameterisation |
| `tests/PlateGeometry.test.ts` | Rifting, subduction and collision as claims about the Earth |
| `tests/PlateMotionModel.test.ts` | The three-state machine and the clock |
| `tests/memory-leak.test.ts` | WeakRef + `forceGC` dispose regression |

Unit tests live only under root `tests/`, mirroring `src/`.

## Commands

```bash
npm run lint && npm run check && npm run build && npm test
```

`npm run release` intentionally skips `npm test` in some sims — append `&& npm test` before the version bump so a release cannot ship a failing suite.

| Command | Description |
|---|---|
| `npm start` / `npm run dev` | Vite dev server |
| `npm run build` | Type-check + production build |
| `npm run build:single` | Single-file build mode |
| `npm run build-data` | Regenerate every dataset from its public source (uses the network) |
| `npm run check` | TypeScript (`tsc --noEmit` + scripts + tests projects) |
| `npm run lint` / `npm run fix` | Biome check / auto-fix |
| `npm test` | Vitest unit tests |
| `npm run test:fuzz` / `test:fuzz:quick` | Playwright fuzz smoke |
| `npm run icons` | Regenerate PWA icons from `public/icons/icon.svg` |

## PWA

After `npm run build`, the sim is installable offline via Workbox
(`dist/manifest.webmanifest`). The relief raster is a build-time asset, so the offline
sim is complete.
