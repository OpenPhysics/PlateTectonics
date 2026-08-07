# Plate Tectonics

An interactive map of the Earth's tectonic plates, built with
[SceneryStack](https://scenerystack.org/) — and drawn from real data throughout.

Toggle layers over a shaded relief map of the world to see why earthquakes, volcanoes,
mountains and trenches are all in the same places; or drop into a cross-section through
a subduction zone, a spreading ridge or a transform fault, where the descending slab is
fitted to the earthquakes that trace it.

## Features

**Global map**

- **Plate boundaries** from the PB2002 plate model, colour-coded divergent /
  convergent / transform.
- **Motion vectors**: each plate's absolute velocity, computed from its Euler pole and
  labelled in mm/year.
- **Earthquakes**: ~8 800 USGS events of M 5.8+ since 1990, sized by magnitude and
  coloured by depth, filterable to shallow, intermediate or deep.
- **Volcanoes and hotspots**: ~1 600 Holocene volcanoes plus the major mantle plumes.
- **Topography / bathymetry**: shaded relief rendered from the NOAA global DEM, so
  trenches, ridges and mountain belts are visible rather than implied.
- **Seafloor age (isochrons)**: lines of equal crustal age at 10, 20, 40 … 180 Ma,
  contoured from the EarthByte age grid. The youngest crust hugs every spreading
  ridge and the same ages appear at the same distance on both flanks, getting older
  out to the continental margins — seafloor spreading, drawn from the measurements.

**Cross-sections** — the Chile trench, the Mid-Atlantic Ridge, and the San Andreas
fault. The surface profile comes from the DEM, the earthquakes and volcanoes are real
events projected from a corridor either side of the profile line, and the slab is
fitted to the hypocentres: the drawn slab *is* the Wadati–Benioff zone.

**Geological time** — run plate motion from 50 million years in the past to 50 million
years into the future at one million years per second. Continents drift, coastlines
tear along plate boundaries, and hotspots stay put while plates slide over them.

**Crust** — three blocks of crust floating in the mantle: fixed oceanic on the left,
fixed continental on the right, and in the middle one whose temperature, composition
and thickness you set. Each settles to the height Airy isostasy puts it at, so a
thicker block stands higher *and* reaches deeper, and a denser one sinks. Zoom out from
the crust to the lithosphere to the whole Earth, and drag a probe through any of it to
read the temperature and density where it sits. Ported from the "Crust" tab of PhET's
Java simulation, with the water loading its isostasy omitted — which is what puts the
sea floor here at a realistic abyssal depth rather than a kilometre too shallow.

**Plate motion** — put two plates at a boundary, choose whether they converge or
diverge, and watch what follows over tens of millions of years. An ocean plate against
a continent subducts, digs a trench, and feeds a volcanic arc inland of it — the offset
set by how far the slab travelled before it was deep enough to melt. Two continents
cannot subduct, so they crumple into a mountain belt with a root beneath it, conserving
the crust's cross-sectional area. Two ocean plates rift apart and make new sea floor
that deepens as it cools. Combinations that have no physical answer, such as two
identical ocean plates converging, are refused rather than guessed at. Ported from the
"Plate Motion" tab; transform boundaries are out of scope, being motion into the page.

The science, the sources and the model's limits are documented in
[`doc/model.md`](doc/model.md); the code is documented in
[`doc/implementation-notes.md`](doc/implementation-notes.md).

## Quick Start

```bash
npm install
npm start        # dev server → http://localhost:5173
```

## Scripts

| Command | Description |
|---|---|
| `npm start` / `npm run dev` | Start Vite dev server |
| `npm run build` | Type-check + production build → `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm test` | Run Vitest unit tests (includes the dataset-integrity and memory-leak suites) |
| `npm run test:fuzz` | Optional Playwright fuzz smoke (`?fuzz`, default 15s) |
| `npm run build-data` | Re-fetch and regenerate every dataset (the only script that uses the network) |
| `npm run check` | TypeScript type check |
| `npm run lint` / `npm run fix` | Biome lint check / auto-fix |
| `npm run icons` | Regenerate PNG icons from `public/icons/icon.svg` |
| `npm run clean` | Remove `dist/` |

`npm run build-data` writes `src/common/data/generated/`, which is committed — normal
builds never touch the network. Downloads are cached under `.cache/data/`.

## Tech Stack

| Tool | Version | Purpose |
|---|---|---|
| [SceneryStack](https://scenerystack.org/) | ^3.0.0 | Simulation framework |
| [Vite](https://vitejs.dev/) | ^8 | Build tool + dev server |
| [TypeScript](https://www.typescriptlang.org/) | ^7 | Type-safe JavaScript |
| [Biome](https://biomejs.dev/) | ^2.5 | Linting + formatting |
| [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) | ^1 | PWA + service worker |

Localized in English, Spanish and French; ships default and projector colour profiles
and full Interactive Description support.

### Data sources

| Dataset | Source | Licence |
|---|---|---|
| Plate outlines, boundaries, Euler poles | Bird (2003), PB2002, doi:10.1029/2001GC000252, via [fraxen/tectonicplates](https://github.com/fraxen/tectonicplates) | ODC-BY 1.0 |
| Coastlines | [Natural Earth](https://www.naturalearthdata.com/) 1:110 m land | Public domain |
| Earthquakes | [USGS ANSS ComCat](https://earthquake.usgs.gov/fdsnws/event/1/) | Public domain |
| Volcanoes | [NOAA NCEI](https://www.ngdc.noaa.gov/hazel/) / Smithsonian GVP Holocene volcano list | Public domain |
| Elevation and bathymetry | [NOAA NCEI global DEM mosaic](https://gis.ngdc.noaa.gov/arcgis/rest/services/DEM_mosaics/DEM_global_mosaic/ImageServer) | Public domain |
| Age of the ocean floor | [EarthByte](https://www.earthbyte.org/category/resources/data-models/seafloor-age/) / Seton et al. (2020), doi:10.1029/2020GC009214 | CC BY 4.0 |

## License

GNU Affero General Public License v3.0 — see [OpenPhysics org license](https://github.com/OpenPhysics/.github/blob/main/LICENSE).

## Contributing

See [OpenPhysics contributing guidelines](https://github.com/OpenPhysics/.github/blob/main/CONTRIBUTING.md).
Report bugs via GitHub Issues; use org issue templates.
