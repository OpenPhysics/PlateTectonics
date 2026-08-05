# Model — Plate Tectonics

What the simulation claims about the Earth, where those claims come from, and where
it stops being a model of anything. Companion to
[implementation-notes.md](./implementation-notes.md), which targets developers.

## The one moving part

Everything on screen except the plate *positions* is a fixed observational dataset.
The only state that evolves is a single number, `timeMillionsOfYearsProperty`: how
far the reconstruction has been run from the present day, negative into the past.

Each plate carries an **Euler pole** — an axis through the centre of the Earth — and
a rotation rate about it. Moving a plate by `t` million years is one rigid rotation
of every point on it:

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

- **Plates are rigid.** Real plates deform, especially at their edges. Run the clock
  and rigid plates overlap and leave gaps; that is the deformation the model does not
  do, not a drawing error.
- **Velocities are today's velocities.** Extrapolating them is reasonable over a few
  million years, a sketch at ±50 Myr (the ends of the slider), and wrong beyond that:
  ridges and subduction zones are born and die, and plates that existed 50 Myr ago —
  the Farallon plate, for one — are missing entirely because the model has no record of
  them. The range is capped at ±50 Myr for that reason.
- **Earthquakes and volcanoes are present-day observations.** They ride their plate
  when the clock runs, so the picture stays coherent, but a 1994 earthquake did not
  happen 20 Myr ago somewhere else.
- **The relief raster is present-day.** It is hidden as soon as the reconstruction
  moves off the present day, because sea floor that has not been created yet cannot be
  shown.
- **Hotspots do not move.** That is deliberate, and it is the physics: a plume is
  anchored in the deep mantle while the plate slides over it, which is why the Hawaiian
  chain gets older to the north-west.
