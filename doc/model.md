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
| Age of the ocean floor | EarthByte / Seton et al. (2020) present-day age grid, doi:10.1029/2020GC009214 | contoured into isochrons at 10, 20, 40 … 180 Ma |

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

## Seafloor isochrons

The **Seafloor age** layer draws the ocean floor's isochrons: the lines along which
the crust is all one age, at 10, 20, 40 … 180 Ma. They come from the EarthByte
present-day age grid, which is built by identifying marine magnetic anomalies —
stripes of alternating remanent magnetisation frozen into basalt as it cools through
the Curie point — and dating them against the geomagnetic polarity timescale, itself
calibrated on radiometrically dated rock. `scripts/build-data.ts` contours the
6-arc-minute grid with marching squares on a 0.3° mesh and simplifies what comes out.

The picture is the argument for seafloor spreading, and it is worth reading in three
steps:

1. **The youngest crust is at the ridges.** The 10 Ma line runs a degree or two either
   side of every spreading axis and nowhere else.
2. **The pattern is symmetric.** The same age appears at about the same distance on
   *both* flanks, because both plates take roughly half the new crust. Across the
   Atlantic at 24° N the 40 Ma line sits about 5° west and 7° east of the axis, the
   80 Ma line about 12° and 13°; `tests/geophysicalData.test.ts` asserts that ordering
   and that symmetry.
3. **It stops at about 180 Ma.** There is no older ocean floor to find, because it has
   all been subducted, while the continents carry rock a *hundred* times older. The
   sea floor is not old and permanent; it is a conveyor.

An isochron is frozen into the crust, so unlike a plate boundary it rides its plate —
vertex by vertex, because one isochron can cross several. Two consequences follow when
the clock runs, and both are honest rather than cosmetic. The two flanks of a pair walk
back towards the ridge that made them. And crust younger than the reconstruction has
reached did not exist yet, so at 50 Myr ago the 10, 20 and 40 Ma isochrons are simply
not drawn.

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
   earthquakes and no deep ones at all. Then add **Seafloor age** and turn the other
   layers off: the isochrons fan out from that same mountain range, matched pair by
   matched pair, red at the axis and blue at the margins. Run the clock back and watch
   the young ones disappear into the ridge that had not yet made them.

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
- **Isochrons are carried rigidly, not un-made.** Hiding the ones younger than the
  reconstruction is right, but the ones that remain are only *rotated* back with their
  plates: the ocean between them should also be closing up, and here it is not, because
  the model has no way to un-make crust. So running to 50 Myr ago narrows the Atlantic
  isochron fan by rather less than it should. The 10 Ma pair walking together onto the
  ridge is the honest part of that picture; the 160 Ma pair barely moving is not.
- **Hotspots do not move.** That is deliberate, and it is the physics: a plume is
  anchored in the deep mantle while the plate slides over it, which is why the Hawaiian
  chain gets older to the north-west.

## The Crust screen

Three blocks of crust float in the mantle. The outer two are fixed and exist to be
compared against; the middle one is the user's, and its temperature, composition and
thickness are the only inputs on the screen.

### Airy isostasy

Crust does not rest *on* the mantle, it floats *in* it, and a column's surface
elevation is fixed by its thickness and density and nothing else. Equating lithostatic
pressure at a compensation depth for a crustal column against a reference column gives,
for a column standing above sea level,

```
e = t·(ρm − ρc)/ρm − C
```

and for one whose top is below sea level, where the overlying seawater is part of the
load,

```
e = [t·(ρm − ρc) − C·ρm] / (ρm − ρw)
```

with ρm = 3300, ρw = 1030 kg/m³. The two agree at e = 0, so the response is continuous
across the shoreline; they do not have the same *slope*, because a submarine column
that thickens displaces water rather than air and therefore rises ρm/(ρm − ρw) ≈ 1.45
times faster per metre of new crust.

**Divergence from PhET.** The simulation this screen is ported from applied the
subaerial formula everywhere, and so under-responded below sea level. The visible
consequence of fixing it: the fixed oceanic block sits at −4163 m, a realistic abyssal
depth, where PhET had it at −2864 m. The continental block is unaffected at +4682 m,
because it is subaerial and that branch is unchanged.

**The reference offset.** `AIRY_REFERENCE_OFFSET_M = 3500` is not a fudge on the
physics — Airy isostasy on its own answers "how high does this column stand above bare
mantle", which is useless as a datum because every real column stands kilometres above
it. The offset re-datums the answer onto a water-covered reference column, whose depth
`C·ρm/(ρm − ρw)` ≈ 5.1 km the code derives explicitly. The value is inherited from PhET
so elevations stay comparable; what is new is that it is named and derived.

### Crustal density

Composition mixes linearly between a cold silica-rich end member (2670 kg/m³) and a
cold iron-rich one (3230 kg/m³); temperature then expands the result thermally,
Δρ/ρ = −α·ΔT, over a 700 K geotherm with α = 3.0 × 10⁻⁵ K⁻¹. PhET wrote this as a
single opaque expression, `2600 + 700·(0.8·(1−c) + 0.10·(1−T))`; back-solving its
thermal term for an expansivity gives ≈ 3.4 × 10⁻⁵ K⁻¹, so their numbers were right and
only their presentation was not. The two agree to within 20 kg/m³ everywhere.

### Temperature datum

PhET's `ZERO_CELSIUS = 293.15f` is 20 °C, not 0 °C, and every temperature in both of
its tabs is offset from that mislabelled datum. The value is kept here — it preserves
the temperature colour ramp — under the name `SURFACE_TEMPERATURE_K`.

### The Earth below

Density with depth is the PREM curve, sampled at 35 depths through the mantle and
continued through the core. PREM is derived from seismic wave speeds, so unlike
everything else on this screen it is an *observation* of the Earth's interior rather
than a model of it. Its top three entries describe ocean and crust, not mantle, and are
deliberately not used: this screen draws its own crust, and reading them for the rock
beneath a block would make the block appear to float on something lighter than itself.
The lookup is clamped at the table's fourth entry, the 25 km Moho (3381 kg/m³), so the
topmost mantle value stands in for everything shallower.

### What this screen does not claim

- Isostatic adjustment here settles in about a second of view time. Real glacial
  isostatic rebound has a relaxation time of order 10 ka. The animation exists to show
  that the block *settles* rather than teleports, not to time anything.
- The relaxation is critically damped, unlike PhET's, which was underdamped and let the
  crust oscillate. The mantle is a viscous fluid, not a spring; a bobbing block would
  teach a misconception.
- Airy isostasy with the slider ranges inherited from PhET still yields +10 km at
  70 km thickness and 2600 kg/m³ — about twice the highest real plateau. That is a
  property of the ranges, which are kept for comparability, not of the physics.
- Local (Airy) compensation only. Real lithosphere has flexural rigidity, so a load is
  supported partly by the strength of the plate around it rather than entirely beneath.

## The Plate Motion screen

Two plates meet at a boundary and the clock runs. Everything drawn is a pure function
of elapsed time — see [implementation-notes.md](./implementation-notes.md).

### The plates

| Plate | Density kg/m³ | Crust top m | Crust base m | Lithospheric mantle m |
|---|---|---|---|---|
| Continental | 2750 | +3500 | −40000 | 70000 |
| Young oceanic | 3000 | −4000 | −10000 | 45000 |
| Old oceanic | 3070 | −4000 | −10000 | 55000 |

Old ocean floor is denser and its lithosphere thicker than young ocean floor because it
has had longer to cool. That single difference is what lets the screen answer "which
one subducts?" with age rather than composition.

The mantle on this screen is drawn at three densities, not one, because they are three
different temperatures of the same rock:

| Material | Density kg/m³ | Why |
|---|---|---|
| Asthenosphere | 3300 | The hot, weak mantle the plates ride on |
| Lithospheric mantle | 3400 | ~1000 K colder; α ≈ 3 × 10⁻⁵ /K puts it ~3% denser |
| Descending slab | 3450 | Colder still, and thick enough to stay that way as it sinks |

The excess density of the cold lithosphere over the asthenosphere beneath it *is* slab
pull — it is why a cooled plate can sink at all. Painting all three at one value, which
is what the screen used to do, erased that from density mode: a plate appeared to be
crust alone, floating on nothing, and the slab was invisible against the mantle it was
descending through.

### What is allowed, and why

| Motion | Plates | Result | Runs for |
|---|---|---|---|
| Convergent | continental + continental | collision | 35 Myr |
| Convergent | any two different, at least one oceanic | subduction | 50 Myr |
| Convergent | two identical oceanic | **refused** | — |
| Divergent | both continental, or both oceanic | rifting | 35 Myr |
| Divergent | one continental, one oceanic | **refused** | — |

Two identical ocean plates have no density contrast to decide which goes down;
picking one arbitrarily would imply the choice was physical. A divergent boundary
between a continent and ocean floor is not a thing that happens — a spreading centre
makes new crust of one kind, and it has to match what is either side.

The denser plate subducts. With these densities that resolves to two rules worth taking
away: **continental crust never subducts**, which is why continents are billions of
years old while no ocean floor is older than 180 Ma; and **the older ocean plate goes
down**, because it is the colder and denser one.

### The slab

Three circular arcs of radius 90, 40 and 90 km, turning through a quarter, a half and a
quarter of the total dip, followed by a straight ray. The total dip is (π/4)·0.8 for
young oceanic lithosphere and (π/4)·1.2 for old — colder, thicker lithosphere sinks
more steeply. The shape was derived for PhET's version in a Mathematica notebook and is
reproduced here.

The curve is parameterised by **arc length**, not by angle or by horizontal distance.
The plate is not stretching, so a point on it covers a fixed distance per million years
whatever part of the bend it is in; any other parameterisation would make the slab
appear to speed up and slow down as it went round the corner.

### Arcs and mountains

Where the slab passes through 100–150 km it dehydrates, and the released water melts the
mantle above it. That melt is buoyant, so it rises vertically from where it was made —
which means the volcanic arc sits inland of the trench by exactly as far as the slab
travelled sideways in reaching melting depth. This is why arcs are offset from trenches
by a characteristic distance rather than sitting on top of them.

In a collision the convergence has nowhere to go but up and down. Crust shortening to a
fraction *f* of its width thickens by 1/*f*, conserving cross-sectional area — the model
walks the material rather than the screen, so the conservation is exact rather than
approximate. About five sixths of the thickening goes down as a root and one sixth up
as topography — the 5:1 root-to-height ratio that Airy isostasy demands for continental
crust (ρc/ρm = 2750/3300) — and is the reason mountain ranges have roots several times
deeper than they are high.

### What this screen does not claim

- **Transform boundaries are out of scope.** Strike-slip motion is displacement into
  the page, which a cross-section cannot show; PhET's version reduced to a rift valley
  plus a symbol. Rather than draw a picture that does not carry the motion, the screen
  offers only convergent and divergent boundaries and says so.
- Plates move at a fixed 15 mm/year regardless of what is happening at the boundary.
  Real plate speeds respond to slab pull and ridge push.
- The trench is an exponential profile fitted to look right, not a solution of plate
  flexure.
- Magma is a single conduit at one place. Real arcs are chains of many volcanoes with
  irregular spacing, and PhET modelled individual blobs with a Poisson process; the
  deterministic version here looks the same and reproduces on reload.
- Each boundary stops at a fixed time. That is a statement about when the process has
  finished saying what it has to say, not about when it stops in the Earth.
- No erosion, no sedimentation, no back-arc spreading, no slab rollback.
