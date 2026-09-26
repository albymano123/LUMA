"""
Produces the map database for the Docker image, with clear errors.

    python -m geodata.provision --out /out/geo.sqlite

Two routes, both ending in the same validated SQLite file:

  * GEO_DB_URL set: download a database that was built earlier with
    `python -m geodata.build` (optionally gzip-compressed, ending in .gz).
    Quick and light on memory; use it when the build machine is small.
  * otherwise: download the OpenStreetMap extract (GEO_PBF_URL, GEO_POLY_URL)
    and build the database here, with a disk-based node index.

The result is checked (schema version, real content) before the image accepts
it, so a bad download can never ship as an empty map.
"""

import argparse
import gc
import gzip
import os
import shutil
import sqlite3
import sys
import time

from geodata.fetch import DownloadError, download, free_disk_mb
from geodata.schema import SCHEMA_VERSION

DEFAULT_PBF = "https://download.openstreetmap.fr/extracts/asia/india/kerala.osm.pbf"
DEFAULT_POLY = "https://download.openstreetmap.fr/polygons/asia/india/kerala.poly"
DEFAULT_SOURCE = "OpenStreetMap extract (Kerala, India)"

# A whole-state extract is far larger than this; smaller means a broken file.
MIN_PBF_BYTES = 5_000_000


class ProvisionError(RuntimeError):
    pass


def memory_report():
    """Total and available memory in MB from /proc/meminfo, or None (not Linux)."""

    try:
        with open("/proc/meminfo", encoding="ascii") as file:
            values = {line.split(":")[0]: int(line.split()[1]) // 1024 for line in file if ":" in line}

        return values.get("MemTotal"), values.get("MemAvailable")
    except (OSError, ValueError, IndexError):
        return None


def print_environment(directory):
    try:
        from importlib.metadata import version

        osmium_version = version("osmium")
    except Exception:
        osmium_version = "not installed"

    memory = memory_report()
    print(f"python {sys.version.split()[0]}, pyosmium {osmium_version}")
    print(f"free disk in {directory}: {free_disk_mb(directory):.0f} MB")

    if memory:
        print(f"memory: {memory[0]} MB total, {memory[1]} MB available")

    sys.stdout.flush()


def validate_database(path, minimum_ways=1000):
    """Raises ProvisionError unless `path` is a usable LumaPath map database."""

    try:
        connection = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    except sqlite3.Error as error:
        raise ProvisionError(f"cannot open database: {error}") from error

    try:
        meta = dict(connection.execute("SELECT key, value FROM meta").fetchall())
        ways = connection.execute("SELECT COUNT(*) FROM ways").fetchone()[0]
        pois = connection.execute("SELECT COUNT(*) FROM pois").fetchone()[0]
    except sqlite3.Error as error:
        raise ProvisionError(f"database is not a LumaPath map database: {error}") from error
    finally:
        connection.close()

    if str(meta.get("schema_version")) != str(SCHEMA_VERSION):
        raise ProvisionError(
            f"database schema {meta.get('schema_version')} does not match this code ({SCHEMA_VERSION}); "
            "rebuild it with python -m geodata.build"
        )

    if ways < minimum_ways or pois < 1:
        raise ProvisionError(f"database looks empty ({ways} roads, {pois} places)")

    print(f"Database OK: {ways:,} roads, {pois:,} places, extract {meta.get('extract_timestamp')}")


def from_prebuilt(url, out_path, workdir):
    target = os.path.join(workdir, "prebuilt.download")
    download(url, target, min_bytes=1_000_000)

    if url.split("?")[0].endswith(".gz"):
        print("Decompressing...", flush=True)

        with gzip.open(target, "rb") as source, open(out_path + ".tmp", "wb") as sink:
            shutil.copyfileobj(source, sink, 1 << 20)

        os.remove(target)
    else:
        shutil.move(target, out_path + ".tmp")

    os.replace(out_path + ".tmp", out_path)


def from_extract(pbf_url, poly_url, out_path, source, workdir, node_index):
    from geodata.build import build

    pbf = os.path.join(workdir, "region.osm.pbf")
    poly = os.path.join(workdir, "region.poly")

    download(poly_url, poly, min_bytes=100)
    download(pbf_url, pbf, min_bytes=MIN_PBF_BYTES)

    started = time.time()

    try:
        build(pbf, poly, out_path, source, node_index)
    except MemoryError as error:
        raise ProvisionError(
            "the build ran out of memory; use a bigger builder or set GEO_DB_URL to a prebuilt database"
        ) from error
    except Exception as error:
        raise ProvisionError(
            f"database build failed after {time.time() - started:.0f}s: {type(error).__name__}: {error}"
        ) from error
    finally:
        gc.collect()  # release the memory-mapped node index before deleting it

        for name in (pbf, poly, node_index.split(",", 1)[1] if "," in node_index else ""):
            try:
                if name and os.path.exists(name):
                    os.remove(name)
            except OSError:
                pass  # temporary files; a failed clean-up must not fail a finished build


def provision(out_path, workdir, db_url=None, pbf_url=DEFAULT_PBF, poly_url=DEFAULT_POLY,
              source=DEFAULT_SOURCE):

    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    os.makedirs(workdir, exist_ok=True)
    print_environment(workdir)

    if db_url:
        print(f"Using prebuilt database: {db_url}", flush=True)
        from_prebuilt(db_url, out_path, workdir)
    else:
        node_index = f"sparse_file_array,{os.path.join(workdir, 'nodes.idx')}"
        from_extract(pbf_url, poly_url, out_path, source, workdir, node_index)

    validate_database(out_path)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", required=True)
    parser.add_argument("--workdir", default="/tmp/geo-build")
    args = parser.parse_args(argv)

    try:
        provision(
            args.out,
            args.workdir,
            db_url=os.environ.get("GEO_DB_URL") or None,
            pbf_url=os.environ.get("GEO_PBF_URL") or DEFAULT_PBF,
            poly_url=os.environ.get("GEO_POLY_URL") or DEFAULT_POLY,
            source=os.environ.get("GEO_SOURCE") or DEFAULT_SOURCE,
        )
    except (DownloadError, ProvisionError) as error:
        print(f"\nERROR: {error}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
