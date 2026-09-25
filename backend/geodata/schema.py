"""
Schema of the local geo-database (one SQLite file).

Why SQLite with R-Tree indexes instead of a database server:
the data is read-only reference data (OpenStreetMap), it must be
queried by location in milliseconds, and it has to ship with the API
on any free host with no extra service to run. SQLite's built-in
R-Tree module is a real spatial index (bounding-box queries in
O(log n)); exact distances are then computed with numpy.

Tables
------
meta        key/value: source, extract date, coverage polygon, counts
pois        emergency services and "activity" places (shops, food, bus stops...)
pois_idx    R-Tree over pois (rowid = pois.id)
ways        one row per OSM highway way, with the tags we score on and
            its geometry (zlib-compressed int32 delta-encoded lon/lat * 1e7)
ways_idx    R-Tree over each way's bounding box (rowid = ways.id)
building_cells  number of mapped buildings per ~50 m grid cell (a compact
            proxy for "built-up, people around" without storing 2.6M footprints)
"""

SCHEMA_VERSION = 3

# kinds stored in pois.kind
EMERGENCY_KINDS = ("hospital", "clinic", "police", "fire_station")
ACTIVITY_KIND = "activity"

COORD_SCALE = 10_000_000

# Building grid: cells of CELL_DEG degrees (about 50 m), key = row << 20 | column.
CELL_DEG = 0.00045
CELL_ROW_SHIFT = 20

DDL = """
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE pois (
    id INTEGER PRIMARY KEY,
    osm_ref TEXT NOT NULL,
    kind TEXT NOT NULL,
    name TEXT,
    phone TEXT,
    emergency_ward INTEGER NOT NULL DEFAULT 0,
    lon REAL NOT NULL,
    lat REAL NOT NULL,
    opening_hours TEXT
);
CREATE VIRTUAL TABLE pois_idx USING rtree(id, min_lon, max_lon, min_lat, max_lat);

CREATE TABLE ways (
    id INTEGER PRIMARY KEY,
    highway TEXT NOT NULL,
    road_class INTEGER NOT NULL,
    sidewalk INTEGER NOT NULL,
    speed REAL,
    paved INTEGER NOT NULL,
    lit INTEGER NOT NULL,
    nodes BLOB NOT NULL
);
CREATE VIRTUAL TABLE ways_idx USING rtree(id, min_lon, max_lon, min_lat, max_lat);

CREATE TABLE building_cells (cell INTEGER PRIMARY KEY, n INTEGER NOT NULL) WITHOUT ROWID;
"""
