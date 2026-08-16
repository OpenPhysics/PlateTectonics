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
  earth/
    model/
      EarthModel.ts     all AXON state
      EarthquakeDepthFilter.ts   depth bands and the filter predicate
    view/
      EarthScreenView.ts  layout, view switching, relief loading, pdomOrder
      EarthCanvasNode.ts           the layers both global views share (canvas)
      MapCanvasNode.ts             the flat global map
      GlobeCanvasNode.ts           the 3-D globe
      PlateOverlayNode.ts          plate labels and motion arrows (Scenery nodes)
      LayerControlPanel.ts         layer checkboxes + depth filter
      ViewControlPanel.ts          the globe / flat-map switch
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
labels and motion arrows (`PlateOverlayNode`) — which also keeps them localized and
reachable.

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

Reset All puts both cameras back, through `EarthScreenView.reset` — a camera
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

- `scripts/data/gplates.ts` + `scripts/data/gplates/resolve.py` resolve the deep-time
  plate model. This is the one step that shells out to Python, and it earns the
  exception: a GPlates rotation file is a *hierarchy* of relative rotations whose shape
  changes with time, and a plate polygon at 100 Ma is rebuilt from whichever moving
  boundary features bounded it then. pyGPlates is the reference implementation of both,
  and reimplementing it in TypeScript to save a build-time dependency would be trading
  a correct answer for a fashionable one. The step creates its own virtualenv under
  `.cache/gplates/`, caches the resolved JSON keyed by span and step, and is not needed
  by `npm run build`, `npm test`, or the shipped sim.

Generated files are excluded from Biome (see `biome.json`) and formatted by
`scripts/data/emit.ts` instead, which keeps the numeric arrays compact.

## Two reconstructions, one painter

The sim reconstructs plate positions in two quite different ways, and the rendering
path is shared rather than duplicated between them.

`PlateReconstruction` (Earth screen) spins each plate about a fixed Euler pole at a
constant rate. `DeepTimeReconstruction` (Deep Time screen) interpolates a published
model's *sampled* finite rotations with a quaternion slerp. What they have in common is
the shape of the answer: `transform(lon, lat, frame)` writing to scratch `lon`/`lat`
fields, which is the `SurfaceTransform` interface in `GlobeFeaturePainter.ts`.

That is what lets both screens share `GlobeFeaturePainter` — the sphere-on-a-disc work
described above, which is by some distance the trickiest code in the sim and the last
thing that should exist in two copies. The painter takes a `GlobeProjection` and a
`SurfaceTransform` and knows nothing else about either screen.

Two consequences worth knowing:

- The Deep Time screen's *resolved* geometry — plate polygons, boundary lines — is
  already at the instant being drawn and must not be rotated again. It still goes
  through the painter, because subdividing long segments and cutting at the limb apply
  to it just as much, so it is handed `IDENTITY_ROTATION_SLOT`: row 0 of the rotation
  table, reserved at build time and guaranteed to be the identity at every sample.
  There is a test on that, because if it ever stopped being the identity the plates
  would slide off the continents they belong to.
- The Deep Time plate wash is composited on an offscreen canvas and drawn once at
  `PLATE_FILL_OPACITY`, rather than filled plate by plate. The model's topologies are
  not a clean tiling — several plate IDs resolve to more than one polygon at the same
  instant, flat slabs and sub-plates overlapping the plate they belong to — and filling
  each straight onto the globe stacks the alpha in the overlaps, which came out as
  near-black slivers.

## Accessibility

- `EarthScreenSummaryContent` derives its *current details* paragraph from the
  model, so a screen-reader user hears whether the globe or the flat map is showing,
  which layers are drawn, which depths pass the filter, and where in geological time
  the plates are.
- Every control carries an `accessibleName` (and a help text where it earns one) from
  the `a11y` string group.
- `EarthScreenView` sets an explicit `pdomOrder`: the global view and its zoom
  buttons → view switch → layer checkboxes → depth filter → time slider → time
  controls → Reset All. The map and the globe are both in it; whichever is hidden drops
  out on its own.
- The keyboard-help dialog has a section per interaction kind: slider, moving a
  draggable item (which is how both the map and the globe are moved), and basic
  actions.

## Testing

`npm test` runs Vitest over `tests/`:

| File | Covers |
|---|---|
| `PlateReconstruction.test.ts` | Euler-pole rotation, round trips, and plate speeds against published values |
| `EarthModel.test.ts` | layer state, depth bands, the time clock and reset |
| `MapProjection.test.ts` | projection round trips, the 2:1 viewport, motion-arrow bearings, the camera |
| `GlobeProjection.test.ts` | orthographic projection and its inverse, visibility, bearings, the camera |
| `geophysicalData.test.ts` | integrity of every generated dataset, plus a few facts about the Earth |
| `memory-leak.test.ts` | WeakRef + forced GC on disposables |

`geophysicalData.test.ts` is the guard on `npm run build-data`: it fails if a
regeneration returns something mangled, and it checks that deep earthquakes still
cluster around the Pacific, which no amount of reshaping should change.

## Three screens and what they share

```
src/
  common/
    model/  ColorMode.ts          density / temperature / both
            Isostasy.ts           Airy elevation, crustal density, crustal geotherm
            EarthStructure.ts     PREM density, layer boundaries, layer temperatures
            CrossSectionScale.ts  two-band model-metres → view-pixels mapping
            EarthCurvature.ts     planar arc lengths → a point on a sphere
            SectionViewModel.ts   flat or 3-D block, and the vertical stretch
    view/   EarthMaterial.ts      density and temperature colour ramps
            ColorModeControlPanel.ts   the shared "View" panel
            MaterialLegendNode.ts      the ramp legend
            EarthProbeNode.ts          the draggable temperature/density probe
            SectionRulerNode.ts        the draggable ruler
            SectionPlacement.ts        what anything drawn over a section needs
            SceneCamera.ts             the block's perspective projection
            QuadRenderer.ts            depth-sorted, flat-shaded faces
            EarthBlockNode.ts          the 3-D block both screens share
            TerrainColors.ts           the elevation ramp on the block's surface
            CanvasArrows.ts            arrow-heads and flow lines
  crust/          the Crust screen
  plate-motion/   the Plate Motion screen
  earth/ the globe and the flat map
```

The three screens share the material colour ramps, the probe, the ruler, the colour-mode
panel and the vertical scale; the two schematic ones also share the 3-D block. The
global screen shares none of the section machinery, because it draws no section: it is
a map, and everything on it is a published dataset rather than a computed shape.

### Painting order on Plate Motion

`PlateMotionCanvasNode` paints sky, then sea, then mantle, then the plates. The mantle is
**clipped to below the ground surface** — the merge of both plates' `crustTop` polylines,
sorted by x. An unclipped mantle band starts at sea level and paints straight over the
water, which is what made `showSeawaterProperty` a no-op and left every ocean floor with
sky above it rather than sea. The clip is also what lets a mountain belt standing above
the waterline still get mantle painted underneath it.

Two related traps, both handled in that file:

- **A `PlateOutline`'s three polylines must run the same direction along x.** `fillBand`
  closes a band by walking the top forward and the base back; two that disagree fold the
  band into a bowtie. `tests/PlateGeometry.test.ts` asserts the invariant for every
  pairing, motion and time, because the failure is silent in the model and spectacular on
  screen.
- **`CrossSectionScale.y` clamps.** A slab that has descended past the bottom of the view
  does not vanish — every point below the floor lands *on* the floor, so it is drawn as a
  horizontal smear along the bottom edge with its arrow-heads strung out sideways.
  `paintSlab` trims the centreline at the first point past `scale.bottomM`.

## Time as a pure parameter

PhET's Plate Motion tab accumulated geometry frame by frame, mutating arrays of samples
inside five behaviour classes. `PlateGeometry` computes the whole boundary from elapsed
time and nothing else:

```
(motionType, leftType, rightType, tMyr) → BoundaryGeometry
```

Nothing in `PlateMotionModel` mutates a shape. The consequences are worth stating
because they are the reason for the choice:

- **Rewind and step-while-paused are free and exact.** Setting the clock to any value
  gives the picture for that value; there is no accumulated state to unwind.
- **The evolution is unit-testable without a clock.** Every claim in
  `tests/PlateGeometry.test.ts` — that a rift opens, that an arc appears inland of a
  trench, that a collision conserves area — is asserted by evaluating the function at a
  time, not by stepping a simulation and hoping.
- **The picture cannot drift with frame rate.** There is no integration to accumulate
  error.

The one thing given up is PhET's Poisson process for individual magma blobs. The
deterministic version looks the same and reproduces on reload.

The same reasoning does *not* apply to the Crust screen's isostatic settling, which is
genuinely a relaxation with state, and is integrated in `IsostaticRelaxation` with a
sub-stepped semi-implicit scheme so it stays frame-rate independent by construction.

## The 3-D block

PhET's original ran on LWJGL with a 3-D camera, and both schematic screens were block
diagrams rather than flat sections. That is back, rendered in software:

```
common/model/  EarthCurvature.ts     planar arc lengths → a point on a sphere
               SectionViewModel.ts   flat or block, and the vertical stretch
common/view/   SceneCamera.ts        perspective projection, and the ray back out
               QuadRenderer.ts       face collection, depth sort, flat shading
               EarthBlockNode.ts     the block: terrain, walls, water, front face
               TerrainColors.ts      the elevation ramp on the top surface
               SectionPlacement.ts   the one thing labels and tools need from a view
               SectionRulerNode.ts   the ruler, back from RulerNode3D
crust/view/         CrustBlockNode.ts
plate-motion/view/  PlateMotionBlockNode.ts
```

### Software 3-D rather than a 3-D library

SceneryStack ships `mobius`, a three.js wrapper, and it would have given a depth buffer,
per-vertex normals and textures. This does not use it. The pipeline needed here is one
rotation, one translation and a perspective divide, and writing it out keeps the
projection a pure function that is unit-tested rather than trusted, keeps the picture
reproducible without a GPU, and keeps roughly 180 KB of gzipped three.js out of the
bundle.

What that costs is a depth buffer. `QuadRenderer` substitutes the painter's algorithm —
faces sorted back to front — which is exact here because nothing interpenetrates: the
terrain is a graph over the ground plane and the cross-section is a stack of bands on one
flat sheet. Where depth genuinely cannot decide the order, an explicit `BLOCK_LAYER`
group does, which is this renderer's version of the `moveToFrontNotifier` the Java
version used for the same purpose. **The groups are spaced ten apart** so a subclass can
subdivide one; Plate Motion needs four sub-orders inside `sectionRock` alone.

The other cost is flat shading: one Lambert factor per face, no texture. Java modulated
everything by a tiled noise bitmap. The grids are sampled finely enough that the ground
reads as a surface, but a close look finds facets.

### What each screen supplies

`EarthBlockNode` owns the block, the terrain, the end walls, the water and the camera. A
subclass says how high the ground is, what rock is at a point, and — if its section has
exact layer boundaries — how to paint the front face.

The default front face samples a colour per grid cell, which is what the Crust screen
needs because its content is a continuous field. `PlateMotionBlockNode` overrides it with
band polygons, because its layer boundaries carry the meaning and grid sampling would
turn each of them into a staircase. That is also far cheaper, which matters because that
screen repaints every frame while its clock runs.

### Framing

Java hard-coded the camera distance for a 1008 × 676 stage and flew the camera into the
block, so only part of it was ever in frame. `SceneCamera.framing` instead solves for the
distance that fits a given block into a given viewport, which is what lets a zoom level
change the block and have the camera follow. The consequence is that the block's *depth*
now has to be chosen to look right — see `BLOCK_DEPTH_PER_HEIGHT`, which is set against
the block's height rather than its width because what it controls is how much of the
picture the top face takes.

### Everything drawn over the section

The labels, the probe and the ruler are Scenery nodes, not painted pixels, so they stay
localizable and reachable. Each therefore needs to be positioned in view coordinates, and
each would otherwise have to know which view is showing. `SectionPlacement` is the one
interface that keeps that in a single place: a screen picks a placement when the mode
changes and hands the same one to everything.

`contour` is part of that interface rather than something callers derive from two
`modelToView` calls, because the two views differ in more than a transform: a line of
constant elevation is a horizontal line when flat and an arc on the block, and drawing
sea level as a chord would put the horizon under the ocean.

Five kinds of thing go through it:

```
common/view/  RangeLabelNode.ts     an extent: two model points, a bar, a name between them
              BoundaryLineNode.ts   a dotted line along a surface, with an x window
              EarthProbeNode.ts     the temperature/density probe
              SectionRulerNode.ts   the ruler
plate-motion/view/  PlateHandleNode.ts   the manual-mode drag handle
```

`RangeLabelNode` is a measurement rather than a caption, and that distinction is the
reason it exists. A word floating in a band says which rock it is; a bar from the top of
the range to its bottom says *where the range starts and stops*, which on the Crust screen
is the quantity the thickness slider changes and on Plate Motion is the only thing telling
the crust apart from the lithosphere it rides on. Two things about it are load-bearing:

- **The label is centred in the visible part of the range, not between its two ends.**
  A range whose base is off the bottom of the picture — the whole-Earth zoom's core, any
  shell on a stretched block — would otherwise put its name where nobody can read it. This
  is PhET's `getLabelPosition`, and `rangeLabelLayout` is a pure function so it can be
  tested rather than eyeballed.
- **A range too short to hold its name collapses** to a leader line out to the side rather
  than being dropped. That is what lets a 6 km oceanic crust still be named on a section
  300 km deep — the case the old "skip anything under 18 px" rule silently lost.

The bar is clipped to the viewport and the name is not: the name has already been pulled
inside, while an unclipped leg runs across the legend and the navigation bar below.

Overlapping ranges are put at different model x. A plate's crust and its lithosphere share
a top edge and differ only in where they end, so two bars at the same x would be drawn one
over the other; PhET staggered them at ⅙ and ⅓ of the way out from the boundary and that
is kept. The Crust screen staggers its four shells the same way.

### The tools

The original's thermometer and density meter remain merged into one `EarthProbeNode`
reporting both quantities at one point — not only tidier, but the screens are about
temperature and density *not being independent*, and reading both at the same place at
the same time is what makes that legible.

The ruler is back. It was dropped on the grounds that a flat section carries its own
implied scale; the block takes that away, being a perspective picture with a
user-adjustable vertical stretch. It is a rigid `RulerNode` fitted to the section at its
own position — both ends projected on every move, setting its pixel length and angle —
which is exact at the ends and wrong by well under a tick in between, in exchange for
keeping its numbers as real text.

### Building the boundary

Before anything can move there has to be a plate on each side, and the two ways of putting
one there end at the same call, `PlateMotionModel.activateZone( side )`.

A press on a crust piece **picks it up** — `armedPlateTypeProperty` — and a press on a drop
zone hands it over. The chooser used to fill the first empty side instead, which meant the
user could not say *which* side a plate went to; a boundary is a comparison between two
sides, so "old ocean on the left" and "old ocean on the right" are not the same experiment.
The same two presses now say which. A zone pressed with nothing in hand clears whatever is
already there, so one side can be changed without New Crust taking the other with it.

A piece can also be **dragged straight into a zone**, which is what PhET had and what the
piece looks like it wants. It is a shortcut through those two steps rather than a second
mechanism: leaving the piece arms it, so the zones light up exactly as a click would, and
releasing over a zone activates that zone. Two consequences worth knowing:

- **A drag released short of a zone leaves the piece in hand**, so a miss degrades into the
  press path instead of dropping what was picked up.
- **The push button and the drag stay out of each other's way by a distance threshold.**
  Below it nothing has happened and the button fires as usual; past it the drag takes over
  and interrupts the button, so one press cannot both drop the piece and toggle it back
  out of hand. The drag listener is deliberately unattached to the pointer — the button
  underneath claims it first, and that button is the whole keyboard path.

`dropZoneBounds` is a pure function of the placement, so *which* side a release lands on is
unit-tested in both views rather than eyeballed in one. Everything else about a zone —
where it is, how it highlights, whether it is still a target — follows the section it is
drawn on, which is why the chooser is handed a `CrustDropTarget` by the screen instead of
working any of it out itself.

### Manual mode

`PlateHandleNode` is a handle standing on each plate; dragging one is what advances the
clock, and the direction of the drag is what *chooses* the boundary type. That is the
screen's causal story — the ridge appears because the user pulled the plates apart, not
because they picked the word "divergent" off a list — and it is why PhET made manual the
default mode rather than an extra.

**It does not weaken time-as-a-pure-parameter.** A handle moves
`timeMillionsOfYearsProperty` and nothing else; every shape is still a pure function of
it, so Rewind and step-while-paused stay exact. PhET's `manualHandleDragTimeChange` called
`clock.stepByWallSecondsForced` for the same reason.

Three pieces, and the split is deliberate:

- `PlateMotionModel.isManualModeProperty` — while it is set, `step` does not advance the
  reconstruction clock at all. PhET's `allowClockTickOnFrame`.
- `PlateMotionModel.selectMotionFromDrag` — *which* motion a deflection means, and whether
  this pairing can do it. In the model, not the handle, so it is unit-tested with the rest
  of the state machine. A drag that would select an illegal motion is refused and the
  already-disabled radio button is what explains why; the handle grows no error surface of
  its own.
- `manualDragRateMyrPerSecond` — PhET's `mapDragMagnitude`, `2.5·θ²`, with the handle's
  deflection fraction standing in for the angle its handle was tilted through. Quadratic,
  so a small pull creeps and a hard pull runs.

One divergence: PhET took the absolute value of the rate, so a handle pushed *back* still
ran the boundary forwards. Here the sign is kept, which makes the handle a scrub control
as well as a throttle and gives the arrow keys on a focused handle something a keyboard
user would expect. It costs nothing — the clock is a parameter, so running it backwards is
exact.

Being held out is a *duration*, not an event, so it has no Property change to hang itself
on; `PlateMotionScreenView.step` is what advances the clock while a handle is held.

### Still not ported

- **Transform boundaries.** Not for the reason they used to be — see the spike below.
- **A toolbox.** The probe and the ruler are always on screen, which is what the probe
  already did; adding a place for them to hide would be a new affordance rather than a
  restored one.

### The transform spike

The documented reason for dropping transform boundaries was that strike-slip motion is
displacement into the page and a cross-section cannot show it. That was true when both
schematic screens were flat sections. The block has depth, so two halves of it sliding
past each other in z is precisely the picture a cross-section could not draw — better than
PhET's own version, which reduced to a rift valley plus arrows. The argument had to be
re-run, and the risk named was that the front face stops being one flat sheet and
`QuadRenderer`'s painter's algorithm stops holding.

**It holds.** Measured against the real renderer:

- Two section halves on *different* z planes are ordered correctly by depth. The sort is
  by mean projected depth within a layer, and two parallel planes never tie.
- `BLOCK_LAYER` needs no new groups. Its sub-orders are per *material* — mantle, slab,
  lithosphere, crust — not per side, so both halves' crust go in one layer and depth
  separates them. The trap is the opposite: giving each half its own sub-layer would make
  layer beat depth and paint the far half over the near one.
- Neither half interpenetrates the other, so the algorithm stays exact.

What transform would actually need is therefore *not* a renderer redesign:

- a z offset per side on `BoundaryGeometry`, left at zero by every other behaviour;
- terrain emitted as two heightfields rather than one, with two new wall faces along the
  fault — which is the fault scarp, and the whole point of the picture;
- the mantle backdrop emitted per half rather than as one band across the section;
- `SceneCamera.framing` given the offset corners. At ±40 km a pulled corner still lands
  inside the viewport, but the framing points are the block's extent and would be wrong.

So the gate the plan set is open, and `doc/model.md` records the decision. The remaining
undecided piece is what the *flat* section does, which genuinely cannot show the motion.

## Naming around the Node API

`Node` already has a `bounds` property and a `scale()` method, so nodes that hold a
viewport or a `CrossSectionScale` name those fields `viewBounds` and `sectionScale`.
Shadowing either silently breaks layout in ways that are hard to trace.

Biome's `noUnusedPrivateClassMembers` does not see reads through `const { x } = this`
destructuring, so painters read `this.sectionScale` directly.
