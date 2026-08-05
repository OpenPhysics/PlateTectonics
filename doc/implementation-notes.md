# Implementation Notes — Plate Tectonics

Developer-facing notes. Companion to [model.md](./model.md), which explains the
science.

## Architecture

```
src/
  PlateTectonicsColors.ts        every ProfileColorProperty (default + projector)
  PlateTectonicsConstants.ts     layout px, Earth-science quantities, time range
  common/
    MapProjection.ts             equirectangular lon/lat ↔ view
    PlateReconstruction.ts       Euler-pole rotation and plate velocities
    data/
      dataTypes.ts               shapes of every dataset (hand-written)
      hotspots.ts                hand-maintained hotspot list
      generated/                 npm run build-data writes these — do not edit
  plate-tectonics/
    model/
      PlateTectonicsModel.ts     all AXON state
      EarthquakeDepthFilter.ts   depth bands and the filter predicate
    view/
      PlateTectonicsScreenView.ts  layout, view switching, relief loading, pdomOrder
      MapCanvasNode.ts             the global map (canvas)
      PlateOverlayNode.ts          plate labels and motion arrows (Scenery nodes)
      CrossSectionNode.ts          a section: canvas + localized annotations
      CrossSectionCanvasNode.ts    the painted section
      CrossSectionGeometry.ts      profile → view coordinates, slab fitting
      LayerControlPanel.ts         layer checkboxes + depth filter
      ViewControlPanel.ts          view combo box
      TimeControlPanel.ts          time slider, play/pause, speed
      MapLegendNode.ts             legend strip + data credit
      LegendSwatches.ts            the symbols, shared by legend and checkboxes
scripts/
  build-data.ts                  fetches and reshapes every dataset
  data/                          fetch cache, GeoTIFF reader, geodesy, emitters
```

## Why the map is a canvas

The map draws roughly 8 800 earthquakes, 1 600 volcanoes, 1 580 boundary segments and
several thousand outline vertices — and *every one of them moves* when the
reconstruction clock runs, because each vertex is rotated about its plate's Euler
pole. Rebuilding that many Kite `Shape`s per frame does not keep up, so `MapCanvasNode`
is a `CanvasNode` that paints them directly. It repaints only when something it
depends on changes: a layer toggle, the depth filter, the reconstruction time, or a
colour-profile switch.

Things that are few and need crisp text stay ordinary Scenery nodes: the sixteen plate
labels and motion arrows (`PlateOverlayNode`), and every cross-section annotation
(`CrossSectionNode`) — which also keeps them localized and reachable.

`PlateReconstruction.transform` writes its result into public scratch fields rather
than returning an object, because it is called tens of thousands of times per frame
and allocating there would dominate the frame budget. At the present day it is the
identity and returns immediately, which is the common case.

## Drawing a sphere on a rectangle

Three problems come out of the projection, all handled in `MapCanvasNode.appendPolyline`:

1. **The antimeridian.** Longitudes are unwrapped as a polyline is walked — each
   vertex is nudged by whole turns to stay within half a turn of the previous one — so
   a feature that straddles ±180° stays in one piece. The ring is then repeated a
   world-width either side, and the clip keeps whichever copy is on screen.
2. **Circumpolar rings.** The North American plate reaches right around the Arctic and
   the Antarctic plate around the South Pole, so their rings gain a whole turn of
   longitude. Filling one has to route over the pole it encloses, or the fill spills
   across the map.
3. **Closing.** Every ring in the data repeats its first vertex at the end, so outlines
   are already closed and `closePath` is only used for fills — which is just as well,
   because on an unwrapped ring `closePath` would draw a chord straight across the map.

Coastline vertices carry a *per-vertex* plate index, so a coastline that straddles a
boundary tears apart correctly under reconstruction — Baja California rides the Pacific
plate away from North America. The outline is broken at those tears (the fill still
spans them) so the torn edge does not leave a stray line across the ocean.

## The data pipeline

`npm run build-data` is the only thing that touches the network. It writes
`src/common/data/generated/`, which is committed, so an ordinary `npm run build` is
offline. Downloads are cached under `.cache/data/` (git-ignored) keyed by a hash of
the URL, so changing a query parameter re-fetches instead of silently reusing the old
response.

Notable pieces:

- `scripts/data/dem.ts` contains a ~120-line GeoTIFF reader. NOAA's image service
  returns an uncompressed, tiled, signed-16-bit TIFF, which is little enough format to
  parse directly and saves a dependency.
- Boundary segments are rebuilt from PB2002's *step* file rather than its boundary
  file, because only the steps carry the class (`OSR`, `SUB`, `CTF`, …) that the
  divergent / convergent / transform colouring needs.
- The relief PNG is rendered at build time from the DEM with a bathymetric-to-alpine
  colour ramp plus a north-west illumination, and a light ice mask over high polar
  ground so Greenland and Antarctica read as ice rather than as mountains.

Generated files are excluded from Biome (see `biome.json`) and formatted by
`scripts/data/emit.ts` instead, which keeps the numeric arrays compact.

## Accessibility

- `PlateTectonicsScreenSummaryContent` derives its *current details* paragraph from the
  model, so a screen-reader user hears which view is showing, which layers are drawn,
  which depths pass the filter, and where in geological time the plates are.
- Every control carries an `accessibleName` (and a help text where it earns one) from
  the `a11y` string group.
- `PlateTectonicsScreenView` sets an explicit `pdomOrder`: view selector → layer
  checkboxes → depth filter → time slider → time controls → Reset All.
- The keyboard-help dialog has a section per interaction kind: slider, combo box, and
  basic actions.

## Testing

`npm test` runs Vitest over `tests/`:

| File | Covers |
|---|---|
| `PlateReconstruction.test.ts` | Euler-pole rotation, round trips, and plate speeds against published values |
| `PlateTectonicsModel.test.ts` | layer state, depth bands, the time clock and reset |
| `CrossSectionGeometry.test.ts` | the two-band layout, crust switching, slab fitting, ridge cooling |
| `MapProjection.test.ts` | projection round trips and the 2:1 viewport |
| `geophysicalData.test.ts` | integrity of every generated dataset, plus a few facts about the Earth |
| `memory-leak.test.ts` | WeakRef + forced GC on disposables |

`geophysicalData.test.ts` is the guard on `npm run build-data`: it fails if a
regeneration returns something mangled, and it checks that deep earthquakes still
cluster around the Pacific, which no amount of reshaping should change.

## Adding a cross-section

1. Add an entry to `SECTIONS` in `scripts/build-data.ts` (profile end points, corridor
   half-width, depth range, minimum magnitude).
2. Extend `ViewKey` in `src/common/data/dataTypes.ts`.
3. Add the view name and its a11y description to every locale JSON, and an item to
   `ViewControlPanel`.
4. Run `npm run build-data`.

The section renders itself from there: the surface comes from the DEM, the seismicity
from USGS, and the slab from the seismicity.
