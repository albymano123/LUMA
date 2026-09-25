"""
Reading OpenStreetMap road tags.

Pure functions with no I/O, shared by the local geo-database builder,
the live Overpass fallback and the ML dataset builder, so a tag is
interpreted identically everywhere.

Flags use small integers so they fit numpy arrays and the database:
  1 = yes, 0 = no, -1 = not mapped (unknown, NOT "no").
"""

import math
import re


ROAD_CLASSES = ("major", "local", "pedestrian_cycle", "other")

_MAJOR = {
    "motorway", "motorway_link", "trunk", "trunk_link",
    "primary", "primary_link", "secondary", "secondary_link",
}
_LOCAL = {
    "tertiary", "tertiary_link", "residential", "unclassified",
    "living_street", "service",
}
_PEDESTRIAN_CYCLE = {"footway", "pedestrian", "path", "steps", "cycleway"}

# highway=* values that are not usable roads or paths.
IGNORED_HIGHWAYS = {
    "proposed", "construction", "abandoned", "razed", "platform",
    "raceway", "bus_guideway", "elevator", "corridor",
}

# Street types where a sidewalk could reasonably exist (index into ROAD_CLASSES).
SIDEWALK_CLASSES = (0, 1)

# Street types where a dead end is meaningful. Driveways and service
# lanes end in dead ends everywhere, so they are not counted.
DEAD_END_HIGHWAYS = {
    "residential", "unclassified", "tertiary", "secondary", "primary",
    "living_street",
}

_SIDEWALK_KEYS = ("sidewalk", "sidewalk:both", "sidewalk:left", "sidewalk:right")
_SIDEWALK_YES = {"both", "left", "right", "yes", "separate"}
_SIDEWALK_NO = {"no", "none"}

_PAVED = {
    "paved", "asphalt", "concrete", "concrete:plates", "concrete:lanes",
    "paving_stones", "sett", "cobblestone", "metal", "wood", "bricks",
}
_UNPAVED = {
    "unpaved", "gravel", "fine_gravel", "compacted", "dirt", "earth",
    "ground", "grass", "mud", "sand", "pebblestone", "rock",
}

_LIT_YES = {"yes", "24/7", "automatic", "limited", "interval", "sunset-sunrise"}
_LIT_NO = {"no", "disused"}

_SPEED_RE = re.compile(r"^\s*(\d+(?:\.\d+)?)\s*(mph)?\s*$", re.IGNORECASE)


def class_of(highway):
    """Index into ROAD_CLASSES for a highway=* value (3 = other)."""

    if highway in _MAJOR:
        return 0

    if highway in _LOCAL:
        return 1

    if highway in _PEDESTRIAN_CYCLE:
        return 2

    return 3


def speed_kmh(tags):
    """maxspeed in km/h, or NaN when missing or not a plain number."""

    value = tags.get("maxspeed")

    if not value:
        return math.nan

    match = _SPEED_RE.match(value)

    if not match:
        return math.nan

    speed = float(match.group(1))

    return speed * 1.609344 if match.group(2) else speed


def sidewalk_flag(tags, road_class):
    """1 = sidewalk, 0 = mapped as none, -1 = not mapped or not applicable."""

    if road_class not in SIDEWALK_CLASSES:
        return -1

    values = {tags[key].lower() for key in _SIDEWALK_KEYS if key in tags}

    if values & _SIDEWALK_YES:
        return 1

    if values & _SIDEWALK_NO:
        return 0

    return -1


def paved_flag(tags):

    surface = tags.get("surface", "").lower()

    if surface in _PAVED:
        return 1

    if surface in _UNPAVED:
        return 0

    return -1


def lit_flag(tags):
    """1 = lit, 0 = mapped as unlit, -1 = not mapped."""

    value = tags.get("lit", "").lower()

    if value in _LIT_YES:
        return 1

    if value in _LIT_NO:
        return 0

    return -1


def way_attributes(tags):
    """Everything we keep about a highway way, or None if it should be ignored."""

    highway = tags.get("highway")

    if not highway or highway in IGNORED_HIGHWAYS:
        return None

    road_class = class_of(highway)

    return {
        "highway": highway,
        "road_class": road_class,
        "sidewalk": sidewalk_flag(tags, road_class),
        "speed": speed_kmh(tags),
        "paved": paved_flag(tags),
        "lit": lit_flag(tags),
    }
