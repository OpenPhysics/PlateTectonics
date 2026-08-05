# Implementation Notes — Plate Tectonics

Developer-facing notes. Companion to [model.md](./model.md), which explains the
science.

## Architecture

```
src/
  PlateTectonicsColors.ts        every ProfileColorProperty (default + projector)
  PlateTectonicsConstants.ts     layout px, Earth-science quantities, time range
  common/
    EarthProjection.ts           the interface both projections implement
    MapProjection.ts             equirectangular lon/lat ↔ view, with a camera
    GlobeProjection.ts           orthographic lon/lat ↔ view, with a camera
    attachGlobeRotation.ts       drag + arrow keys → the globe's camera
    attachMapNavigation.ts       drag + arrow keys → the flat map's camera
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
      EarthCanvasNode.ts           the layers both global views share (canvas)
      MapCanvasNode.ts             the flat global map
      GlobeCanvasNode.ts           the 3-D globe
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
  data/                          fetch cache, GeoTIFF + netCDF readers, geodesy,
                                 marching-squares contouring, emitters
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
   a feature that straddles ±180° stays in one piece. The *first* vertex is unwrapped
   against the camera instead, which puts the feature on the copy of the world the map
   is looking at; the feature is then repeated a world-width either side whenever that
   copy would show it too, and the clip keeps whichever copies are on screen.
2. **Circumpolar rings.** The North American plate reaches right around the Arctic and
   the Antarctic plate around the South Pole, so their rings gain a whole turn of
   longitude. Filling one has to route over the pole it encloses, or the fill spills
   across the map. The turns the *walk* accumulates are counted separately from the
   turns that carried the feature to the camera, or a plate far from the camera would
   be mistaken for one that goes round the world.
3. **Closing.** Every ring in the data repeats its first vertex at the end, so outlines
   are already closed and `closePath` is only used for fills — which is just as well,
   because on an unwrapped ring `closePath` would draw a chord straight across the map.

Coastline vertices carry a *per-vertex* plate index, so a coastline that straddles a
boundary tears apart correctly under reconstruction — Baja California rides the Pacific
plate away from North America. The outline is broken at those tears (the fill still
spans them) so the torn edge does not leave a stray line across the ocean.

## Panning and zooming the flat map

`MapProjection` carries a camera of the same shape as the globe's — the longitude and
latitude at the centre of the viewport — plus a zoom level the map is drawn at 2^level.
`attachMapNavigation` moves it, in the same two senses `attachGlobeRotation` uses: a
drag takes hold of the map, and the arrow keys move the viewpoint.

The two axes are not symmetric, and the projection is why. Longitude is periodic, so
panning east wraps and never stops. Latitude is bounded, so the camera is clamped to
`latitudeLimit` = 90 − 90/scale: **zero at level 0**, where the whole 180° is already on
screen and there is nothing to pan to, and opening up as zooming in shrinks what fits.
That is the whole of "left and right always, up and down once you are zoomed in" — no
interaction code special-cases it.

Three things follow from the camera, and each one is a bug that was visible before it
was fixed:

- `project` now reports **false outside the viewport**, which is what stops a plate
  label being drawn over the legend and saves the canvas from plotting 9 000
  epicentres that are four viewport-widths off to the side. The flat overlay is
  clipped to the viewport as well, so a label at the edge is cut rather than spilling.
- `viewX` deliberately does **not** wrap: the mapping stays linear so an unwrapped
  polyline keeps its shape. Wrapping is `project`'s business, for single points.
- The **dataset seams** — the ±180° slits and polar closures that `PLATES` and
  `LAND_RINGS` are cut along — used to sit exactly on the edge of the viewport, where
  they could not be seen. Panning moves that edge, so they are now skipped when
  stroking (never when filling) by the same `isSeamSegment` rule the globe has always
  used; it moved to `EarthCanvasNode` when the second caller appeared. Without it the
  Pacific gets a bright line straight up the middle of it.

Reset All puts both cameras back, through `PlateTectonicsScreenView.reset` — a camera
is a way of looking at the Earth rather than a fact about it, so neither belongs in the
model. `showGlobeProperty` does, because it is a choice about what is shown.

## Drawing a sphere as a sphere

The **3-D globe** (`GlobeCanvasNode`, off by default) is the same layers in the same
order and the same colours; only the projection differs. Both views are written against
`EarthProjection`, whose `project` returns *whether* a point can be seen as well as
where it goes — always true on the flat map, and false for the far hemisphere on the
globe. Everything that draws geography goes through it, including `PlateOverlayNode`,
which is instantiated once per projection.

`GlobeProjection` is plain orthographic (Snyder pp. 145–153) with the camera stored as
the longitude and latitude at the centre of the disc, so dragging is just moving that
point. It also inverts, which is how the equirectangular relief raster gets onto a
disc: each pixel is un-projected and sampled, into a texture rebuilt only when the
camera moves.

The rectangle's problems (the antimeridian, circumpolar rings) vanish; three of its own
take their place, all in `GlobeCanvasNode`:

1. **The limb.** Polylines are cut where they cross it — the crossing is found by
   interpolating on `GlobeProjection.depth`, which changes sign exactly there. Filled
   outlines cannot simply be cut, so where one dips behind the limb it detours to a
   ring outside the disc, skirts round to where it reappears and drops back in; the
   disc clip trims the detour into a clean round edge. (This is NAAP's trick, by way of
   `BasicCoordinatesAndSeasons`.)
2. **Long segments.** The datasets were shaped for a flat map, where a straight line
   between vertices is right and a long one is harmless — the Pacific plate's eastern
   edge climbs 66° of latitude in a single step. On a globe that step is a chord
   straight through the Earth, so segments are sampled along their great circle every
   5°, which puts them back on the surface where the limb can hide them.
3. **Dataset seams.** A plate that straddles the antimeridian is stored slit open along
   ±180°, and one that reaches a pole is closed off along the pole — fourteen such
   segments in `PLATES`, plus two polar ones. On the flat map they fall exactly on the
   edge of the viewport and are never seen; on a globe the antimeridian is an ordinary
   meridian, so they are filled but not stroked.

Motion arrows differ too, and the difference belongs to the projection: `bearing` on
the flat map draws the compass azimuth as a screen angle ("the Nazca plate moves
east"), while on the globe it steps along the bearing across the sphere and projects
both ends, because north is only "up" at the centre of the disc.

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
- `scripts/data/netcdf.ts` reads the classic netCDF-3 format, for the same reason: the
  EarthByte age grid is published as a header of big-endian counted fields followed by
  the raw values, which is small enough to parse directly and saves the build a
  dependency on the netCDF/HDF5 stack.
- `scripts/data/contour.ts` is marching squares, used once, to turn that age grid into
  isochron polylines. Cells with a missing corner are skipped whole, so a contour stops
  at the edge of the ocean instead of being interpolated onto land, and it works in
  grid coordinates so that two neighbouring cells produce bit-identical crossings on
  their shared edge — which is what lets the segments be strung together by exact key
  match rather than by proximity.
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
- `PlateTectonicsScreenView` sets an explicit `pdomOrder`: the global view and its zoom
  buttons → view selector → layer checkboxes → depth filter → time slider → time
  controls → Reset All. The map and the globe are both in it; whichever is hidden drops
  out on its own.
- The keyboard-help dialog has a section per interaction kind: slider, moving a
  draggable item (which is how both the map and the globe are moved), combo box, and
  basic actions.

## Testing

`npm test` runs Vitest over `tests/`:

| File | Covers |
|---|---|
| `PlateReconstruction.test.ts` | Euler-pole rotation, round trips, and plate speeds against published values |
| `PlateTectonicsModel.test.ts` | layer state, depth bands, the time clock and reset |
| `CrossSectionGeometry.test.ts` | the two-band layout, crust switching, slab fitting, ridge cooling |
| `MapProjection.test.ts` | projection round trips, the 2:1 viewport, motion-arrow bearings, the camera |
| `GlobeProjection.test.ts` | orthographic projection and its inverse, visibility, bearings, the camera |
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
