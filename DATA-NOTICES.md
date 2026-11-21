# Data notices

The Seoul walking-network tiles and their index are derived from
© OpenStreetMap contributors. The database is available under the
[Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
See [OpenStreetMap copyright](https://www.openstreetmap.org/copyright).

The source extract and its timestamp and checksum are recorded in the
distributed index. The original extract provider is
[Geofabrik](https://download.geofabrik.de/asia/south-korea.html).
The distributed tiles can be downloaded individually from the application
using that index.

The Seoul administrative boundary is derived from
[OpenStreetMap relation 2297418](https://www.openstreetmap.org/relation/2297418)
and distributed under the same ODbL 1.0 terms.

Background map tiles are used under the
[OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/).
Place search and regular forecasts are fetched from their providers at runtime.

The dated demos use an hourly subset of the ECMWF AIFS archive from
[Open-Meteo Historical Forecast](https://open-meteo.com/en/docs/historical-forecast-api),
shared under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
Fields were selected and timestamps converted to UTC. Download details are in
`public/data/weather/aifs-20260202.json`.

The private input directory contains other data and local credentials.
