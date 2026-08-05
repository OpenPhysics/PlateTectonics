# CLAUDE.md — Plate Tectonics

Sim-specific context for AI assistants. General SceneryStack guidance: [OpenPhysics/.github/CLAUDE.md](https://github.com/OpenPhysics/.github/blob/main/CLAUDE.md).

## Project

An interactive map of the Earth's tectonic plates, plus cross-sections through a
subduction zone, a spreading ridge and a transform fault. **Everything on screen is
real data** — plate model, earthquakes, volcanoes, elevation — so changes that affect
what is drawn should be checked against [`doc/model.md`](doc/model.md), which records
where each number comes from and what the model does not claim.

Forked from [SceneryStackTemplate](https://github.com/OpenPhysics/SceneryStackTemplate).

## Key files

| File | Purpose |
|---|---|
| `src/PlateTectonicsColors.ts` | All `ProfileColorProperty` instances, including the plate palette |
| `src/PlateTectonicsConstants.ts` | Layout px, Earth-science quantities, geological-time range |
| `src/PlateTectonicsNamespace.ts` | Namespace for color property names |
| `src/i18n/StringManager.ts` | Singleton localized string accessor |
| `src/common/EarthProjection.ts` | The interface both projections implement |
| `src/common/MapProjection.ts` | Equirectangular lon/lat ↔ view |
| `src/common/GlobeProjection.ts` | Orthographic lon/lat ↔ view, plus the globe's camera |
| `src/common/attachGlobeRotation.ts` | Drag and arrow keys → the globe's camera |
| `src/common/PlateReconstruction.ts` | Euler-pole rotation and plate velocities |
| `src/common/data/dataTypes.ts` | Shapes of every dataset (hand-written) |
| `src/common/data/hotspots.ts` | Hand-maintained hotspot list |
| `src/common/data/generated/` | **Generated — do not edit.** `npm run build-data` owns it |
| `src/plate-tectonics/model/PlateTectonicsModel.ts` | All AXON state |
| `src/plate-tectonics/model/EarthquakeDepthFilter.ts` | Depth bands and the filter predicate |
| `src/plate-tectonics/view/PlateTectonicsScreenView.ts` | Layout, view switching, `pdomOrder` |
| `src/plate-tectonics/view/EarthCanvasNode.ts` | The layers both global views share (canvas painting) |
| `src/plate-tectonics/view/MapCanvasNode.ts` | The flat global map |
| `src/plate-tectonics/view/GlobeCanvasNode.ts` | The 3-D globe |
| `src/plate-tectonics/view/PlateOverlayNode.ts` | Plate labels + motion arrows |
| `src/plate-tectonics/view/CrossSectionGeometry.ts` | Profile → view coords, slab fitting |
| `src/plate-tectonics/view/CrossSectionCanvasNode.ts` | The painted cross-section |
| `src/plate-tectonics/view/CrossSectionNode.ts` | Section + localized annotations |
| `src/plate-tectonics/view/LegendSwatches.ts` | Map symbols, shared by legend and checkboxes |
| `scripts/build-data.ts` | Fetches and reshapes every dataset |
| `scripts/data/` | Fetch cache, GeoTIFF reader, geodesy, emitters |

## Working on this sim

### The generated data

`src/common/data/generated/` is written by `npm run build-data` and committed, so
normal builds are offline. Never hand-edit those files. To change what is in them,
change `scripts/build-data.ts` and re-run it; downloads are cached under `.cache/data/`
keyed by URL hash, so re-runs are fast and a changed query parameter re-fetches.

`tests/geophysicalData.test.ts` guards the regeneration: it checks structural
integrity and a few facts about the Earth (deep earthquakes cluster around the
Pacific; the Chile profile's deep events sit inland of its shallow ones). Run
`npm test` after any regeneration.

### Rendering

The map and the cross-sections are `CanvasNode`s, not trees of `Path`s, because every
feature moves when the reconstruction clock runs — see the rationale in each file's
header and in `doc/implementation-notes.md`. Text stays as Scenery `Text` so it can be
localized and reached by a screen reader.

Sphere-on-a-rectangle hazards (antimeridian wrapping, circumpolar rings, ring closure,
coastlines tearing at plate boundaries) are all handled in
`MapCanvasNode.appendPolyline`. Read its comments before touching it; each rule is
there because of a specific artifact.

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
in the *view* (`PlateTectonicsScreenView` resets it), because it is a camera, not
physics; `showGlobeProperty` is model state because it is a choice about what is shown.

### Colors

Every color is a `ProfileColorProperty` in `PlateTectonicsColors.ts`, including the
eight-entry `platePaletteColorProperties` used to tell neighbouring plates apart.
Canvas painting reads them through `.value.toCSS()`, and the canvas nodes link the
relevant properties so a Projector Mode switch repaints.

Boundary colors (red / cyan / violet) and earthquake-depth colors (yellow → orange →
magenta) have to stay mutually distinguishable *and* readable over the relief raster.
Check both profiles after changing any of them.

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

`PlateTectonicsModel` composes `TimeModel` for play/pause and elapsed wall-clock time.
The elapsed time drives cross-section flow animation; the *reconstruction* clock is a
separate `timeMillionsOfYearsProperty`, advanced in `step()` at
`millionYearsPerSecond` and clamped to ±50 Myr.

## Accessibility

The three required layers are wired up:

- `PlateTectonicsScreenSummaryContent` builds a **live** `currentDetails` paragraph
  from the model — view, layers, depth filter, geological time.
- Every control has an `accessibleName` from the `a11y` string group; several have
  `accessibleHelpText`.
- `PlateTectonicsScreenView` sets an explicit `pdomOrder` ending at Reset All, and
  `PlateTectonicsKeyboardHelpContent` documents sliders, the combo box and basic actions.

A11y strings live under `a11y.plateTectonics` in each locale JSON, exposed via
`StringManager.getPlateTectonicsA11yStrings()`. Full checklist:
[Baton/ACCESSIBILITY.md](https://github.com/OpenPhysics/Baton/blob/main/ACCESSIBILITY.md).

## Compliance carve-outs

- **Generated data is excluded from Biome** (`biome.json` → `files.includes`). Those
  files are machine-formatted by `scripts/data/emit.ts` to keep numeric arrays compact.
- **Canvas painting instead of Scenery nodes** for the map and cross-sections, for the
  performance reason above. The interactive controls are all standard sun components.

## Testing

| Path | Purpose |
|---|---|
| `tests/PlateReconstruction.test.ts` | Euler-pole rotation; plate speeds against published values |
| `tests/PlateTectonicsModel.test.ts` | Layer state, depth bands, time clock, reset |
| `tests/CrossSectionGeometry.test.ts` | Two-band layout, crust switching, slab fitting, ridge cooling |
| `tests/MapProjection.test.ts` | Projection round trips, 2:1 viewport, motion-arrow bearings |
| `tests/GlobeProjection.test.ts` | Orthographic projection and its inverse, visibility, bearings, camera |
| `tests/geophysicalData.test.ts` | Integrity of the generated datasets |
| `tests/memory-leak.test.ts` | WeakRef + `forceGC` dispose regression |

Unit tests live only under root `tests/`, mirroring `src/`.

## Commands

```bash
npm run lint && npm run check && npm run build && npm test
```

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
