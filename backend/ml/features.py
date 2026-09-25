"""
The feature vector used by the experimental ML component.

Every feature is an ENVIRONMENT feature: it describes the road, the
route shape or the nearby emergency services, from OpenStreetMap or the
routing geometry. None of them is a safety or crime measurement.
"Safety" only enters the pipeline through real incident records
supplied later (see ml/README.md).

The same function turns either a live route or a training window into
a row, so training and prediction cannot drift apart.
"""

import math


# Order matters: it is the column order the model is trained on.
FEATURE_COLUMNS = [
    "directness",
    "turns_per_km",
    "major_road_share",
    "local_road_share",
    "pedestrian_cycle_road_share",
    "sidewalk_share",
    "maxspeed_mean_kmh",
    "paved_share",
    "junctions_per_km",
    "dead_ends_per_km",
    "hospital_median_m",
    "police_median_m",
]


def feature_row(shape, road, emergency):
    """
    shape:     route_shape_features() output
    road:      road_network_features() output
    emergency: {"hospital_median_m": .., "police_median_m": ..}

    Missing values become NaN (not zero): the model, and the
    training code, treat "not mapped" differently from "none".
    """

    def pick(source, key):
        value = source.get(key) if source else None
        return math.nan if value is None else float(value)

    road = road if road and road.get("available") else {}

    return {
        "directness": pick(shape, "directness"),
        "turns_per_km": pick(shape, "turns_per_km"),
        "major_road_share": pick(road, "major_road_share"),
        "local_road_share": pick(road, "local_road_share"),
        "pedestrian_cycle_road_share": pick(road, "pedestrian_cycle_road_share"),
        "sidewalk_share": pick(road, "sidewalk_share"),
        "maxspeed_mean_kmh": pick(road, "maxspeed_mean_kmh"),
        "paved_share": pick(road, "paved_share"),
        "junctions_per_km": pick(road, "junctions_per_km"),
        "dead_ends_per_km": pick(road, "dead_ends_per_km"),
        "hospital_median_m": pick(emergency, "hospital_median_m"),
        "police_median_m": pick(emergency, "police_median_m"),
    }
