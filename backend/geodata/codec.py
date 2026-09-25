"""
Encoding shared by the database builder and the runtime store. Kept free
of build-only dependencies (pyosmium) so the API can run without them.
"""

import zlib

import numpy as np

from geodata.schema import CELL_DEG, CELL_ROW_SHIFT, COORD_SCALE


def encode_nodes(coords):
    """[lon, lat] rows -> zlib(int32 first point + deltas), compact and fast to decode."""

    ints = np.rint(np.asarray(coords, dtype=float) * COORD_SCALE).astype("<i4")
    deltas = ints.copy()
    deltas[1:] -= ints[:-1]

    return zlib.compress(deltas.tobytes(), 6)


def decode_nodes(blob):
    """Inverse of encode_nodes: an (n, 2) float array of lon, lat."""

    deltas = np.frombuffer(zlib.decompress(blob), dtype="<i4").reshape(-1, 2)

    return np.cumsum(deltas.astype(np.int64), axis=0) / COORD_SCALE


def cell_key(lon, lat):
    """Grid cell (as one integer) containing a point; works on numpy arrays too."""

    column = np.floor(np.asarray(lon) / CELL_DEG).astype(np.int64) + (1 << 19)
    row = np.floor(np.asarray(lat) / CELL_DEG).astype(np.int64) + (1 << 19)

    return (row << CELL_ROW_SHIFT) | column
