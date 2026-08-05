# Model — Plate Tectonics

What the simulation claims about the Earth, where those claims come from, and where
it stops being a model of anything. Companion to
[implementation-notes.md](./implementation-notes.md), which targets developers.

## The one moving part

Everything on screen except the plate *positions* is a fixed observational dataset.
The only state that evolves is a single number, `timeMillionsOfYearsProperty`: how
far the reconstruction has been run from the present day, negative into the past.

Each plate carries an **Euler pole** — an axis through the centre of the Earth — and
a rotation rate about it. Moving a point on a plate by `t` million years is one
rotation:

```
θ = rate (°/Myr) × t (Myr)          about the plate's pole
```

`PlateReconstruction` evaluates that with Rodrigues' rotation formula. Because the
rotation is rigid, a point's velocity over the ground is

```
v = ω × r
```

with `ω` the rotation vector and `r` the position vector. With `ω` in radians per
million years and `r` in km, `|v|` comes out in km/Myr, which is numerically the same
as mm/year — the unit plate speeds are quoted in. That is what the motion vectors on
the map show, and it is why the Nazca arrow is long and the Antarctic arrow is a stub.

## Where the numbers come from

| Quantity | Source | Notes |
|---|---|---|
| Plate outlines and boundaries | Bird (2003), *An updated digital model of plate boundaries* (PB2002), doi:10.1029/2001GC000252 | 52 plates; segments classified from the model's own step file |
| Euler poles | PB2002 pole table + NNR-NUVEL-1A Pacific rotation | see below |
| Relative velocity across each boundary | PB2002 step file (`VELOCITYLE`) | mm/year, averaged along each segment |
| Coastlines | Natural Earth 1:110 m land | public domain |
| Earthquakes | USGS ANSS ComCat, M ≥ 5.8 since 1990 | ~8 800 events with depth and magnitude |
| Volcanoes | NOAA NCEI Holocene volcano list (Smithsonian GVP holdings) | ~1 600 volcanoes |
| Hotspots | Hand-maintained list of the plumes named in introductory texts | `src/common/data/hotspots.ts` |
| Topography and bathymetry | NOAA NCEI global DEM mosaic | rendered to a shaded relief raster, and sampled along each cross-section |

### From PB2002's poles to absolute plate motion

PB2002 publishes each plate's rotation **relative to the Pacific plate**. Rotation
vectors add, so a plate's absolute (no-net-rotation) motion is

```
ω(plate / NNR) = ω(plate / PA) + ω(PA / NNR)
```

with `ω(PA / NNR)` the NNR-NUVEL-1A Pacific rotation, (−63.045° N, 107.374° E,
0.6408 °/Myr). `scripts/build-data.ts` does that addition once, at build time, and
writes the resulting poles into `plateData.ts`.

The result reproduces the speeds textbooks quote — Pacific ≈ 67 mm/yr WNW at Hawaii,
Nazca ≈ 78 mm/yr ENE, Australia ≈ 67 mm/yr NNE, North America ≈ 16 mm/yr WSW — and
`tests/PlateReconstruction.test.ts` checks them, so a sign error anywhere in that
chain fails the test suite rather than quietly drawing the Atlantic closing.

Two independent checks confirm the derivation. PB2002 also publishes a **relative**
velocity across every boundary step, a number the poles here were not built from;
recomputing it as `|ω₁ × r − ω₂ × r|` matches the published value to a median of
0.04 mm/yr over all 1 580 segments (`tests/geophysicalData.test.ts`). And integrating
`r × (ω × r)` over the whole globe — the condition that defines the no-net-rotation
frame — leaves a residual equivalent to 0.009 °/Myr, about 1 mm/yr at the equator, so
the frame really is the one it claims to be.

## What carries what

A plate's interior moves with the plate. A plate **boundary** cannot: it belongs to
two plates at once, and carrying it with either one drives it into the other. That is
where the gaps and overlaps in a naive reconstruction come from — run the clock to the
end of the slider and the two sides of a typical boundary end up some 1 600 km apart,
tearing the map open along the ridges and piling it up at the trenches.

So boundaries are given rotations of their own:

| Boundary | What it rides | Why |
|---|---|---|
| Spreading ridge | mean of the two plates' rotation vectors | where the axis sits when accretion is symmetric |
| Transform fault | mean of the two | stationary with respect to a fault the plates merely slide along |
| Subduction zone | the **overriding** plate | a trench is a feature of the plate that stays; the other is being consumed |

PB2002 names each boundary section with a separator that doubles as a cross-section
through it — `-` where neither plate descends, `\` where the left-hand plate descends
beneath the right, `/` where the right-hand one does — so `NZ\SA` is Nazca going down
under South America and `TO/PA` is the Pacific going down under Tonga. That is where
the overriding plate is read from.

Plate outlines are then carried by the boundary network rather than by the plate
inside them, each vertex taking a distance-weighted blend of the boundary motions near
it. Because the blend depends on *position alone*, two plates that share an edge carry
it identically and the mosaic stays a mosaic. What changes through time is each
plate's **area**: it grows along its spreading ridges and shrinks at its trenches,
which is sea floor being made and unmade, and is the thing worth watching.

The outlines are subdivided until this stops showing: an edge whose ends ride motions
far enough apart to stretch it by more than 200 km over the slider's range is split
and reconsidered. `tests/PlateEvolution.test.ts` holds the whole scheme in place.

## Earthquake depth bands

Hypocentres are grouped at **70 km** and **300 km**, the conventional shallow /
intermediate / deep divisions. The bands are not arbitrary: down to about 70 km the
lithosphere everywhere is cold enough to break, so shallow earthquakes happen at every
kind of boundary, while intermediate and deep events happen almost only inside a
subducting slab. Filtering to *deep* on the global map therefore draws a map of the
world's subduction zones and nothing else — which is the point of the control.

## Cross-sections

Three profiles, one per boundary type:

| View | Profile | Depth shown |
|---|---|---|
| Subduction zone | 74.5° W → 60.5° W at 21.5° S, across the Chile trench | 700 km |
| Spreading ridge | 50° W → 40° W at 24° N, across the Mid-Atlantic Ridge | 60 km |
| Transform fault | across the San Andreas fault at Parkfield, perpendicular to its N40° W strike | 40 km |

For each one the build script samples the DEM along the profile, then projects every
earthquake and volcano within a corridor either side of it (200 km, 120 km and 40 km
respectively) onto the profile line. The surface is real and the seismicity is real:
2 839 earthquakes in the Chile section alone.

**The slab is fitted to the earthquakes.** `CrossSectionGeometry` bins the hypocentres
by depth and takes the median distance along the profile in each bin. That polyline
*is* the Wadati–Benioff zone, and it is what the drawn slab follows, so the picture and
the data cannot disagree.

Two things in a cross-section are schematic rather than measured: the crust /
lithosphere / asthenosphere thicknesses (textbook averages, with the crust thickened
under high ground and thinned under ocean according to the real elevation), and the
mantle-flow arrows. In the ridge section the plate thickness follows the half-space
cooling law, `thickness ≈ 9.5 √age`, with age taken from distance ÷ half-spreading
rate — which is why the plate is thin at the axis and thickens away from it.

### Two vertical scales

Surface relief and slab depth differ by two orders of magnitude: the Andes rise 6 km
while the slab beneath them reaches 600 km. A single vertical scale makes one of them
invisible, so a cross-section is drawn in two bands — relief on top with its own
scale, depth below — and the view states the exaggeration factor on screen rather than
distorting the picture silently.

## Three things worth doing with the sim

1. **The Ring of Fire.** Switch on earthquakes and volcanoes and look at the Pacific.
   Both cluster on the same lines, and those lines are the convergent boundaries: the
   correlation is the evidence that subduction causes both.
2. **Wadati–Benioff zones.** Set the depth filter to *deep* on the global map: almost
   every remaining dot is around the Pacific and Sunda. Then open the Chile section
   and watch the events step down along the slab from the trench to 600 km.
3. **Seafloor spreading.** Switch on boundaries and topography, and follow the ridges:
   a continuous mountain range down the middle of the Atlantic, marked by shallow
   earthquakes and no deep ones at all.

## What this model is not

- **Plate interiors are rigid.** Only the boundaries deform, and only in the sense
  above — a plate changes area but never changes shape internally. The deforming belts
  along real plate edges, which is where the Andes, the Himalaya and the Basin and
  Range are, are drawn as though they were not deforming at all.
- **Velocities are today's velocities.** Extrapolating them is reasonable over a few
  million years, a sketch at ±50 Myr (the ends of the slider), and wrong beyond that:
  ridges and subduction zones are born and die, and plates that existed 50 Myr ago —
  the Farallon plate, for one — are missing entirely because the model has no record of
  them. The range is capped at ±50 Myr for that reason.
- **The microplates are the first thing to stop meaning anything.** PB2002 resolves
  plates a couple of degrees across whose poles sit almost on top of them, so they
  spin: ten of the fifty-two turn through more than half a revolution over 50 Myr, and
  Manus through seven full turns. Nothing like that happened — such plates are
  transient features that do not survive tens of millions of years — and because a
  boundary is shared, a spinning microplate drags its larger neighbour's edge with it.
  That is why the south-west Pacific and the Galápagos region look scribbled at the
  ends of the slider while Africa, the Americas, Eurasia, Australia, Antarctica and
  the Pacific stay clean. The sixteen labelled plates hold their area to within a
  factor of four; the microplates do not, and no rule about how boundaries move can
  rescue an Euler pole extrapolated that far.
- **Earthquakes and volcanoes are present-day observations.** They ride their plate
  when the clock runs, so the picture stays coherent, but a 1994 earthquake did not
  happen 20 Myr ago somewhere else.
- **The relief raster is present-day.** It is hidden as soon as the reconstruction
  moves off the present day, because sea floor that has not been created yet cannot be
  shown.
- **Hotspots do not move.** That is deliberate, and it is the physics: a plume is
  anchored in the deep mantle while the plate slides over it, which is why the Hawaiian
  chain gets older to the north-west.
