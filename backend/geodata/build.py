"""
Builds the local geo-database from an OpenStreetMap extract.

    python -m geodata.build --pbf data/raw/kerala.osm.pbf --poly data/raw/kerala.poly --out data/kerala_geo.sqlite

Needs `pip install -r requirements-data.txt` (pyosmium). Takes about
a minute for Kerala. Extracts (with matching .poly boundaries) are
available from https://download.openstreetmap.fr/extracts/ and
https://download.geofabrik.de/ .

The database is generated data: it is not committed to git.
"""

import argparse
import json
import os
import sqlite3
import sys
import time
from datetime import datetime, timezone

import numpy as np
import osmium

from geodata.codec import cell_key, encode_nodes
from geodata.coverage import parse_poly
from geodata.schema import (
    ACTIVITY_KIND,
    DDL,
    EMERGENCY_KINDS,
    SCHEMA_VERSION,
)
from road_tags import way_attributes


# Same "busy street" places the live Overpass fallback looks for.
ACTIVITY_AMENITIES = {
    "restaurant", "cafe", "fast_food", "food_court", "ice_cream", "bar", "pub",
    "bank", "atm", "fuel", "pharmacy", "bus_station", "marketplace", "cinema",
    "theatre", "library", "townhall", "community_centre", "post_office",
    "school", "college", "university",
}

BATCH = 20_000


def _poi_kind(tags):
    """The stored kind for an OSM object's tags, or None if we do not keep it."""

    amenity = tags.get("amenity")

    if amenity in EMERGENCY_KINDS:
        return amenity

    if (
        amenity in ACTIVITY_AMENITIES
        or "shop" in tags
        or tags.get("highway") == "bus_stop"
    ):
        return ACTIVITY_KIND

    return None


def _area_center(area):
    """Centre of an area's first outer ring's bounding box, or None."""

    for ring in area.outer_rings():
        lons, lats = zip(*((node.lon, node.lat) for node in ring))
        return (min(lons) + max(lons)) / 2, (min(lats) + max(lats)) / 2

    return None


def _insert_ways(connection, pbf, node_index):

    rows, index_rows = [], []
    total = 0

    processor = (
        osmium.FileProcessor(pbf, osmium.osm.NODE | osmium.osm.WAY)
        .with_locations(node_index)
        .with_filter(osmium.filter.EntityFilter(osmium.osm.WAY))
        .with_filter(osmium.filter.KeyFilter("highway"))
    )

    def flush():
        connection.executemany("INSERT INTO ways VALUES (?,?,?,?,?,?,?,?)", rows)
        connection.executemany("INSERT INTO ways_idx VALUES (?,?,?,?,?)", index_rows)
        rows.clear()
        index_rows.clear()

    for way in processor:

        attributes = way_attributes(dict(way.tags))

        if attributes is None:
            continue

        try:
            coords = np.array([(n.lon, n.lat) for n in way.nodes])
        except osmium.InvalidLocationError:
            continue

        if len(coords) < 2:
            continue

        speed = attributes["speed"]

        rows.append((
            way.id,
            attributes["highway"],
            attributes["road_class"],
            attributes["sidewalk"],
            None if np.isnan(speed) else float(speed),
            attributes["paved"],
            attributes["lit"],
            encode_nodes(coords),
        ))
        index_rows.append((
            way.id,
            float(coords[:, 0].min()), float(coords[:, 0].max()),
            float(coords[:, 1].min()), float(coords[:, 1].max()),
        ))
        total += 1

        if len(rows) >= BATCH:
            flush()

    flush()

    return total


def _insert_pois(connection, pbf):

    counts = {}
    next_id = 1
    batch = []

    def flush():
        connection.executemany("INSERT INTO pois VALUES (?,?,?,?,?,?,?,?,?)", batch)
        connection.executemany(
            "INSERT INTO pois_idx VALUES (?,?,?,?,?)",
            [(row[0], row[6], row[6], row[7], row[7]) for row in batch],
        )
        batch.clear()

    processor = osmium.FileProcessor(pbf).with_areas().with_filter(
        osmium.filter.KeyFilter("amenity", "shop", "highway")
    )

    for obj in processor:

        # Nodes, plus areas (which cover closed ways and multipolygons,
        # so buildings mapped as ways are not counted twice).
        if isinstance(obj, osmium.osm.Node):
            position = (obj.lon, obj.lat) if obj.location.valid() else None
            reference = f"node-{obj.id}"
        elif isinstance(obj, osmium.osm.Area):
            position = _area_center(obj)
            reference = f"{'way' if obj.from_way() else 'relation'}-{obj.orig_id()}"
        else:
            continue

        if position is None:
            continue

        tags = dict(obj.tags)
        kind = _poi_kind(tags)

        if kind is None:
            continue

        batch.append((
            next_id,
            reference,
            kind,
            # Names and phones are only needed for emergency services.
            None if kind == ACTIVITY_KIND else tags.get("name") or tags.get("name:en"),
            None if kind == ACTIVITY_KIND else tags.get("phone") or tags.get("contact:phone"),
            1 if tags.get("emergency") == "yes" else 0,
            position[0],
            position[1],
            # Only emergency services carry hours; it is shown to the user
            # exactly as mapped, and only when someone mapped it.
            None if kind == ACTIVITY_KIND else tags.get("opening_hours"),
        ))
        counts[kind] = counts.get(kind, 0) + 1
        next_id += 1

        if len(batch) >= BATCH:
            flush()

    flush()

    return counts


def _insert_buildings(connection, pbf, node_index):
    """Counts buildings per grid cell, using one point of each footprint."""

    lons, lats = [], []

    processor = (
        osmium.FileProcessor(pbf, osmium.osm.NODE | osmium.osm.WAY)
        .with_locations(node_index)
        .with_filter(osmium.filter.EntityFilter(osmium.osm.WAY))
        .with_filter(osmium.filter.KeyFilter("building"))
    )

    for way in processor:

        if len(way.nodes) == 0:
            continue

        try:
            node = way.nodes[0]
            lons.append(node.lon)
            lats.append(node.lat)
        except osmium.InvalidLocationError:
            continue

    keys, counts = np.unique(cell_key(lons, lats), return_counts=True)
    counts = np.minimum(counts, 255)

    connection.executemany(
        "INSERT INTO building_cells VALUES (?,?)",
        zip(keys.tolist(), counts.tolist()),
    )

    return len(lons), len(keys)


def build(pbf_path, poly_path, out_path, source_name="OpenStreetMap extract", node_index="flex_mem"):

    started = time.time()

    with open(poly_path, encoding="utf8") as file:
        polygon = parse_poly(file.read())

    reader = osmium.io.Reader(pbf_path)
    extract_timestamp = reader.header().get("osmosis_replication_timestamp")
    reader.close()

    temporary = out_path + ".building"

    if os.path.exists(temporary):
        os.remove(temporary)

    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)

    connection = sqlite3.connect(temporary)
    connection.executescript(DDL)
    connection.execute("PRAGMA journal_mode = OFF")
    connection.execute("PRAGMA synchronous = OFF")

    print("Reading roads...")
    way_count = _insert_ways(connection, pbf_path, node_index)
    connection.commit()
    print(f"  {way_count:,} ways")

    print("Reading emergency services and activity places...")
    poi_counts = _insert_pois(connection, pbf_path)
    connection.commit()
    print("  ", poi_counts)

    print("Counting buildings per grid cell...")
    building_total, cell_total = _insert_buildings(connection, pbf_path, node_index)
    connection.commit()
    print(f"  {building_total:,} buildings in {cell_total:,} cells")

    meta = {
        "schema_version": SCHEMA_VERSION,
        "building_count": building_total,
        "source": source_name,
        "extract_timestamp": extract_timestamp,
        "built_at": datetime.now(timezone.utc).isoformat(),
        "coverage_polygon": json.dumps(polygon),
        "way_count": way_count,
        "poi_counts": json.dumps(poi_counts),
        "attribution": "Data (c) OpenStreetMap contributors, ODbL",
    }
    connection.executemany("INSERT INTO meta VALUES (?,?)", [(k, str(v)) for k, v in meta.items()])
    connection.commit()

    connection.execute("PRAGMA journal_mode = DELETE")
    connection.execute("VACUUM")
    connection.close()

    os.replace(temporary, out_path)

    size_mb = os.path.getsize(out_path) / 1e6
    print(f"Built {out_path} ({size_mb:.0f} MB) in {time.time() - started:.0f}s")


def main(argv=None):

    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--pbf", required=True)
    parser.add_argument("--poly", required=True)
    parser.add_argument("--out", default="data/kerala_geo.sqlite")
    parser.add_argument("--source", default="OpenStreetMap extract (Kerala, India)")
    parser.add_argument(
        "--node-index", default="flex_mem",
        help="pyosmium node location index; use sparse_file_array,/tmp/nodes.idx "
             "on machines with little memory (slower, uses disk instead)",
    )
    args = parser.parse_args(argv)

    build(args.pbf, args.poly, args.out, args.source, args.node_index)


if __name__ == "__main__":
    sys.exit(main())
