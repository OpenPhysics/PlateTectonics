# Credits — Plate Tectonics

An interactive map of the Earth's tectonic plates, built with SceneryStack as part of
the [OpenPhysics](https://github.com/OpenPhysics) fleet.

## License

GNU Affero General Public License v3.0 or later — see [org LICENSE](https://github.com/OpenPhysics/.github/blob/main/LICENSE).

## Data sources

The simulation renders published observational data. Two of these sources ask for
attribution and all of them deserve it; they are credited on screen, in the About
dialog, and here.

### Plate model — PB2002

Bird, P. (2003). *An updated digital model of plate boundaries.* Geochemistry,
Geophysics, Geosystems, 4(3), 1027. [doi:10.1029/2001GC000252](https://doi.org/10.1029/2001GC000252)

Plate outlines, boundary steps and Euler poles. The GeoJSON conversion is by Hugo
Ahlenius (Nordpil) and csterling, published at
[github.com/fraxen/tectonicplates](https://github.com/fraxen/tectonicplates) under the
[Open Data Commons Attribution License 1.0](https://opendatacommons.org/licenses/by/1-0/).
The pole table is taken from the author's own distribution at
[peterbird.name](http://peterbird.name/oldFTP/PB2002/).

Absolute plate motions are derived from those Pacific-relative poles using the
NNR-NUVEL-1A Pacific rotation of Argus & Gordon (1991).

### Coastlines — Natural Earth

[Natural Earth](https://www.naturalearthdata.com/) 1:110 m land polygons, via
[nvkelso/natural-earth-vector](https://github.com/nvkelso/natural-earth-vector).
Public domain.

### Earthquakes — USGS

[USGS ANSS Comprehensive Catalog (ComCat)](https://earthquake.usgs.gov/fdsnws/event/1/),
via the FDSN event web service. Work of the U.S. Geological Survey, in the public
domain.

### Volcanoes — NOAA NCEI / Smithsonian GVP

[NOAA National Centers for Environmental Information](https://www.ngdc.noaa.gov/hazel/)
Holocene volcano list, which draws on the Smithsonian Institution's Global Volcanism
Program holdings. Public domain.

### Elevation and bathymetry — NOAA NCEI

[NOAA NCEI global DEM mosaic](https://gis.ngdc.noaa.gov/arcgis/rest/services/DEM_mosaics/DEM_global_mosaic/ImageServer).
Public domain. The shaded relief raster shipped with the sim is rendered from it by
`npm run build-data`.

## Acknowledgments

Built with [SceneryStack](https://scenerystack.org/), from the
[OpenPhysics SceneryStack template](https://github.com/OpenPhysics/SceneryStackTemplate).
