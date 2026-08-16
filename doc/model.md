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
| Topography and bathymetry | NOAA NCEI global DEM mosaic | rendered to a shaded relief raster |
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

## Three things worth doing with the sim

1. **The Ring of Fire.** Switch on earthquakes and volcanoes and look at the Pacific.
   Both cluster on the same lines, and those lines are the convergent boundaries: the
   correlation is the evidence that subduction causes both.
2. **Wadati–Benioff zones.** Set the depth filter to *deep*: almost every remaining
   dot is around the Pacific and Sunda, tracing the slabs that descend there. Turn the
   globe so the Pacific faces you and the scatter resolves into a ring.
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

Most of these are limits of *extrapolating today's velocities*, not limits of plate
tectonics. The Deep Time screen replaces that extrapolation with a published
reconstruction and is bound by a different set of limits — see below.

## The Deep Time screen

The Earth screen answers "where were the plates?" by spinning today's velocities
backwards. This screen answers it by replaying a model that was fitted to the
geological record: **Müller et al. (2019)**, *A Global Plate Model Including
Lithospheric Deformation Along Major Rifts and Orogens Since the Triassic*, Tectonics
38(6), 1884–1907, [doi:10.1029/2018TC005462](https://doi.org/10.1029/2018TC005462),
distributed by EarthByte under CC BY 4.0. It covers 0–250 Ma, which reaches Pangaea.

The model is resolved at build time with pyGPlates (`npm run build-data plate-history`)
into 51 instants, one every 5 Myr. Nothing about GPlates ships in the sim: the output is
two committed modules, like every other dataset here.

### Why the data comes in two different shapes

This is the one thing worth understanding about the screen, because it is visible on
it.

A **coastline** is a static feature. It has present-day geometry, and it was cookie-cut
by plate ID, so reconstructing it is one rigid rotation of that geometry. It therefore
needs no per-instant storage at all — a table of finite rotations per plate ID is
enough, and the runtime interpolates between samples, so **the continents glide**.

A **plate polygon** is not a static feature. It has no present-day geometry to rotate:
it is *resolved* at each instant from whichever moving boundary features bounded it
then. Plates are also born and destroyed — 52 today, 17 at 180 Ma, 11 at 250 Ma, as the
ocean floor that carried the rest had not been made yet. That genuinely has to be baked
per instant, so **the plates and boundaries step**, 5 Myr at a time.

The rotations are interpolated as rotations — quaternion slerp, taking the short way
round — and not by blending pole latitude, pole longitude and angle, which gives
visibly wrong paths worst exactly where a plate is moving fastest.

### What this screen does not claim

- **The stepping is real, and it is 5 Myr.** A ridge appears between one instant and
  the next rather than growing. Making it finer is a straight trade against the size of
  the generated module, which is already the largest thing the sim ships.
- **Only the reconstruction is drawn.** No earthquakes, volcanoes or relief: those are
  present-day observations and mean nothing at 200 Ma. The Earth screen is where they
  belong.
- **The plate mosaic has holes, and they are honest.** The rigid plates do not tile the
  globe; the gaps are the *deforming belts* — orogens and rifts where the model
  explicitly does not treat the lithosphere as rigid. They are a separate layer, off by
  default, and switching them on fills the gaps in. This is precisely the thing the
  Earth screen says it cannot show.
- **The past only.** No published reconstruction runs forwards, so the slider stops at
  the present day. Running plate motion into the future is the Earth screen's job, and
  it is honest about how far.
- **Deep time is less certain than recent time.** Rotations before about 200 Ma rest on
  palaeomagnetism and geology rather than on seafloor magnetic anomalies, because the
  ocean floor that recorded them has been subducted. The reconstruction is a published
  best estimate, not a measurement.

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

### What is named, and where

Each shell and the user's own block carry an *extent* — a bar from the top of the range to
its bottom with the name between them — rather than a caption floating in a band. That is
PhET's `RangeLabelNode` and it is doing real work here: the screen is about how thick the
middle block is and how deep it reaches, and only a bar can say either. The user's block in
particular had no extent indicator at all, so the thickness slider had nothing to read
against.

The four shells sit at different model x so their bars do not stack in one column. The
upper mantle's bar starts at the base of the user's crust, which is what PhET tracked — the
mantle really does begin where that block ends, and at the crust zoom that boundary is the
one thing on screen moving as the sliders are dragged.

**"My Crust" disappears at the whole-Earth zoom.** Its three sliders act on a block that at
that scale is thinner than the line drawn around it, so leaving them live would offer a
control whose effect cannot be seen. PhET hid it at every zoom but the closest; it is kept
at the lithosphere zoom here, because there the block is still a visible sliver and
watching it change against 100 km of lithosphere is the comparison that zoom is for.

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

### The block, and vertical exaggeration

The Crust screen can be drawn flat or as a 3-D block of Earth with the section cut
across its front face. The block is the default and is what PhET's Java version drew,
because the claim the screen makes is about *floating*: flat, a denser block reads as a
rectangle sliding down; as a block it reads as a landscape drowning.

Three things about the block are claims rather than decoration:

- **The surface is curved.** Every point is bent about the centre of the Earth by the
  same mapping PhET used (`convertToRadial`), so sea level across the block is an arc of
  a great circle, not a line. Over the Crust screen's 450 km that is a 4 km drop at the
  ends; over the Plate Motion screen's 1400 km it is 38 km — more than the crust is
  thick, which is why drawing it flat would be the larger distortion.
- **The default is true scale.** At an exaggeration of 1 a kilometre downward and a
  kilometre across the block are drawn the same size, and the curvature and the layer
  thicknesses are in an honest relationship. The readout says *true scale* rather than
  *1×* to make that the named case.
- **The exaggeration is uniform.** Where the flat view magnifies a shallow band and
  compresses the deep one (see [Two vertical scales](#two-vertical-scales)), the block
  offers only a single stretch of the whole thing. A piecewise vertical map would bend
  the layers relative to the surface they are parallel to, and the curvature would stop
  meaning anything. The cost is that the crust is a sliver at the whole-Earth zoom
  unless the user stretches it, which is what the slider is for.

## The Plate Motion screen

Two plates meet at a boundary and the clock runs. Everything drawn is a pure function
of elapsed time — see [implementation-notes.md](./implementation-notes.md). Like the
Crust screen it can be drawn flat or as a 3-D block, on the same terms as above; the
block is where a subduction zone reads as a trench offshore with a line of volcanoes
inland of it, rather than as a wedge and a triangle.

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

**An arc lags its trench.** Melt does not erupt the moment the slab is deep enough: it
rises slowly, pools at the base of the overriding crust, and only once enough has collected
does a conduit open and a volcano start to grow. So the screen shows a chamber filling for
millions of years before anything appears at the surface, and nothing erupts below full.

| Downgoing plate | Overriding plate | Melt starts collecting | Chamber full |
|---|---|---|---|
| Old oceanic | continental | 18.5 Myr | 24 Myr |
| Young oceanic | continental | 22 Myr | 26.5 Myr |
| Old oceanic | oceanic | 18.5 Myr | 19.6 Myr |
| Young oceanic | oceanic | 22 Myr | 22.9 Myr |

The two rules behind the table are PhET's, and both are physical. Older lithosphere is
colder, denser and dips more steeply, so it reaches the dehydration window in less
horizontal travel and therefore sooner. And an oceanic overriding plate fills its chamber
five times faster, because oceanic crust is a third the thickness of continental — there is
far less of it for the melt to work through and far less cold rock to be heated on the way,
which is why island arcs are volcanically productive on a shorter timescale than
continental arcs.

**The arc is a chain, not a ridge.** Its cones repeat every 2π × 10 km across the block and
step sideways by 10 km in a repeating centre–left–right pattern, which is PhET's shape and
is what makes an island arc recognisable rather than a wall. Each cone gets its own plume.
This is the one place on the screen where the two-dimensional model is *not* simply
extruded straight back — see the last section below.

**Manual mode does not change any of this.** Whether the clock runs itself or a handle
drives it, the boundary at time *t* is the same boundary; a handle moves *t* and nothing
else. What manual mode changes is the claim the screen makes: the ridge appears because the
user pulled the plates apart, rather than because they chose the word "divergent". Dragging
a handle outward asks for a divergent boundary and inward for a convergent one, and a drag
asking for something this pairing cannot do is refused — the same refusal the boundary
chooser makes, by the same rule.

In a collision the convergence has nowhere to go but up and down. Crust shortening to a
fraction *f* of its width thickens by 1/*f*, conserving cross-sectional area — the model
walks the material rather than the screen, so the conservation is exact rather than
approximate. About five sixths of the thickening goes down as a root and one sixth up
as topography — the 5:1 root-to-height ratio that Airy isostasy demands for continental
crust (ρc/ρm = 2750/3300) — and is the reason mountain ranges have roots several times
deeper than they are high.

### What this screen does not claim

- **Transform boundaries are not offered yet, and the old reason no longer holds.** They
  were dropped because strike-slip motion is displacement into the page and a cross-section
  cannot show it. That was true when both schematic screens were flat sections; the block
  has depth, and two halves of it sliding past each other in z is exactly the picture a
  cross-section could not draw. The risk was that the front face stops being one flat sheet
  and the block's painter's algorithm stops being exact. It was measured against the
  renderer and it holds — see
  [implementation-notes.md](./implementation-notes.md#the-transform-spike) for what would
  actually be needed. So the screen still offers only convergent and divergent, but as
  unfinished work rather than as a claim about what a section can show, and the one piece
  still undecided is what the *flat* view does, which genuinely cannot show the motion.
- Plates move at a fixed 15 mm/year regardless of what is happening at the boundary.
  Real plate speeds respond to slab pull and ridge push.
- The trench is an exponential profile fitted to look right, not a solution of plate
  flexure.
- The arc is one chain of evenly spaced cones fed by one chamber. Real arcs have
  irregular spacing, several magma systems, and volcanoes that die while their neighbours
  grow. PhET modelled the individual melt blobs with a Poisson process; the blobs here are
  at fixed phases of the clock, which looks the same and reproduces on reload — see
  [implementation-notes.md](./implementation-notes.md#time-as-a-pure-parameter).
- Each boundary stops at a fixed time. That is a statement about when the process has
  finished saying what it has to say, not about when it stops in the Earth.
- No erosion, no sedimentation, no back-arc spreading, no slab rollback.
- **Only the volcanic arc has structure in the third dimension.** Everything else is a
  two-dimensional model extruded straight back, which is what a cross-section assumes: the
  trench, the ridge and the mountain belt are the same at the back of the block as at the
  front, and the terrain varies front to back only by a little roughness added to high
  ground. The arc is the exception because "a line of separate cones" is most of what an
  island arc *is*, and a wall of rock says the opposite. A real trench is still a line on a
  sphere, a real arc still curves, and neither of those is here.
- **The smoke is decoration, not a model of an eruption.** Puffs are placed at fixed
  phases of the clock so that Rewind and step-while-paused stay exact; nothing about
  their size or rate is derived from the magma.
