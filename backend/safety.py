"""
Rule-based, explainable safety scoring - the single source of truth
for the numeric "safety_score" shown to the user, and for whether
there is enough evidence to score a route at all (data_confidence).

The frontend only displays what this module returns; it never
calculates or adjusts a score.

ROUTE RANKING (categorize_routes, below) is a related but separate
question: which route gets tagged safest/balanced. It is still decided
here, and the rule-based score is still its dominant input, but it is
boundedly nudged by the AI/ML risk model (ml/risk_model.py) when one
has been trained and validated on real collision data - see
_ranking_score and ML_RANKING_WEIGHT. This is the one place AI/ML
genuinely participates in route recommendation; it never participates
in the displayed score itself.

A route is scored on up to six factors, each 0-100, each built from
real, mapped data and each measured as a share of the route's length
(so a longer route does not look safer just because it passes more
things):

  emergency     how close the route stays to hospitals/clinics and
                police stations
  activity      how much of the route passes shops, food places,
                banks, transit stops (people around)
  surroundings  how much of the route has buildings nearby, and the
                longest isolated stretch with none
  lighting      share of streets marked lit in OpenStreetMap
  road_safety   traffic exposure for people on foot or bicycle:
                sidewalks, speed limits, share of fast main roads
  weather       current rain, wind, storms and visibility

When a factor's data is unavailable it is left out and the remaining
weights are rescaled; the response reports this as lower confidence
instead of pretending the value is zero. Tag-based factors (lighting,
sidewalks, speed limits) are only used when enough of the route's
streets carry the tag, because OpenStreetMap tagging is uneven.

The score describes conditions visible in open data. It is not a
guarantee that a route is safe, and it is not built from crime or
incident records (none are available).
"""


# ==================================================
# WEIGHTS
# ==================================================
#
# Each row sums to 1.0. At night lighting, activity and surroundings
# matter more and weather relatively less. Cycling gives road/traffic
# exposure more weight; for drivers, people around and lighting matter
# less than emergency access and weather (a weight of 0 means the
# factor does not apply to that mode).
#
# ==================================================

WEIGHTS = {
    ("walking", True): {"emergency": 0.25, "activity": 0.15, "surroundings": 0.20, "lighting": 0.05, "road_safety": 0.10, "weather": 0.25},
    ("walking", False): {"emergency": 0.20, "activity": 0.20, "surroundings": 0.20, "lighting": 0.20, "road_safety": 0.10, "weather": 0.10},
    ("cycling", True): {"emergency": 0.25, "activity": 0.10, "surroundings": 0.15, "lighting": 0.05, "road_safety": 0.20, "weather": 0.25},
    ("cycling", False): {"emergency": 0.20, "activity": 0.10, "surroundings": 0.15, "lighting": 0.20, "road_safety": 0.20, "weather": 0.15},
    ("driving", True): {"emergency": 0.40, "activity": 0.0, "surroundings": 0.10, "lighting": 0.10, "road_safety": 0.0, "weather": 0.40},
    ("driving", False): {"emergency": 0.35, "activity": 0.0, "surroundings": 0.10, "lighting": 0.25, "road_safety": 0.0, "weather": 0.30},
}

FACTOR_LABELS = {
    "emergency": "Emergency access",
    "activity": "Street activity",
    "surroundings": "Built-up surroundings",
    "lighting": "Street lighting",
    "road_safety": "Road and traffic exposure",
    "weather": "Weather",
}

# Share of the total factor weight that must have data before we
# publish a score at all. Weather on its own never qualifies: at
# least one map-based factor must be present too.
MIN_SCORED_WEIGHT = 0.4
MAP_FACTORS = ("emergency", "activity", "surroundings", "lighting", "road_safety")

# A tag-based ratio (lit, sidewalk, speed limit) is only trusted when
# at least this share of the route's streets carry the tag.
MIN_TAG_COVERAGE = 0.30

# Routes whose scores differ by no more than this are treated as
# equally safe: it is smaller than the noise in open data, and it keeps
# a 1-point difference from choosing a much slower route.
SCORE_TIE_MARGIN = 2

CONFIDENCE_RANK = {"high": 2, "medium": 1, "low": 0}


def risk_level(score):

    if score >= 75:
        return "Lower risk"

    if score >= 55:
        return "Moderate risk"

    return "Higher risk"


def _pct(share):
    return f"{round(share * 100)}%"


def _missing(text):
    return None, [{"impact": "neutral", "text": text}]


# ==================================================
# FACTOR SCORERS
# Each returns (score or None, [explanations])
# ==================================================

def _describe_distance(metres):

    if metres is None:
        return "none found nearby"

    if metres < 1000:
        return f"typically {round(metres / 50) * 50} m away"

    return f"typically {metres / 1000:.1f} km away"


def score_emergency(metrics):

    hospital = metrics.get("hospital_access")
    police = metrics.get("police_access")

    if hospital is None or police is None:
        return _missing("Emergency-service data was unavailable, so it was not scored")

    score = 100 * (0.5 * hospital + 0.5 * police)
    notes = []

    for access, noun, median_key in (
        (hospital, "hospitals or clinics", "hospital_median_m"),
        (police, "police stations", "police_median_m"),
    ):
        distance = _describe_distance(metrics.get(median_key))

        if access >= 0.75:
            notes.append({"impact": "positive", "text": f"Good mapped availability of {noun} along this route ({distance})"})
        elif access >= 0.4:
            notes.append({"impact": "neutral", "text": f"Moderate access to mapped {noun} ({distance})"})
        else:
            notes.append({"impact": "negative", "text": f"Limited mapped {noun} along this route ({distance})"})

    return score, notes


def score_activity(metrics):

    coverage = metrics.get("activity_coverage")

    if coverage is None:
        return _missing("Street-activity data was unavailable, so it was not scored")

    # 70% of the route passing shops / transit / food is treated as
    # fully "active"; few routes exceed that.
    score = min(100.0, coverage / 0.7 * 100)
    quiet = 1 - coverage

    if coverage >= 0.6:
        notes = [{"impact": "positive", "text": f"Mapped shops, food places or transit stops are close to {_pct(coverage)} of the route"}]
    elif coverage >= 0.3:
        notes = [{"impact": "neutral", "text": f"About {_pct(quiet)} of the route has few mapped shops or services nearby"}]
    else:
        notes = [{"impact": "negative", "text": f"Mostly quiet by mapped data: {_pct(quiet)} of the route has few shops, services or transit stops nearby"}]

    longest_quiet = metrics.get("longest_quiet_km") or 0

    if coverage >= 0.3 and longest_quiet >= 0.5:
        notes.append({"impact": "negative", "text": f"Longest stretch without mapped activity is about {longest_quiet} km"})

    return score, notes


def score_surroundings(metrics):

    share = metrics.get("built_up_share")

    if share is None:
        return _missing("Building data was unavailable for this area, so surroundings were not scored")

    # 85% of the route with buildings close by counts as fully built up.
    score = min(100.0, share / 0.85 * 100)
    longest = metrics.get("longest_unbuilt_km") or 0

    # One long empty stretch matters more than its share of the route.
    score -= min(30.0, 10.0 * max(0.0, longest - 0.5))
    score = max(0.0, score)

    if share >= 0.75:
        notes = [{"impact": "positive", "text": f"Buildings are mapped close to {_pct(share)} of the route, so people are likely nearby"}]
    elif share >= 0.4:
        notes = [{"impact": "neutral", "text": f"Buildings are mapped close to {_pct(share)} of the route; the rest is more open"}]
    else:
        notes = [{"impact": "negative", "text": f"Few mapped buildings along this route (only {_pct(share)} of it is close to any), so it may feel isolated"}]

    if longest >= 0.5:
        notes.append({"impact": "negative", "text": f"Longest stretch with no mapped buildings nearby is about {longest} km"})

    return score, notes


def score_lighting(metrics, is_day):

    lit_share = metrics.get("lit_ratio")
    coverage = metrics.get("lit_coverage")

    if lit_share is None or coverage is None or coverage < MIN_TAG_COVERAGE:
        return _missing(
            "Street lighting is not mapped for most of this route, so it was not scored"
            " (unmapped does not mean unlit)"
        )

    score = lit_share * 100

    if lit_share >= 0.75:
        notes = [{"impact": "positive", "text": f"Most mapped streets on this route are lit ({_pct(lit_share)})"}]
    elif lit_share >= 0.4:
        notes = [{"impact": "neutral", "text": f"About {_pct(lit_share)} of mapped streets on this route are lit"}]
    else:
        notes = [{"impact": "negative", "text": f"Poor street lighting: only {_pct(lit_share)} of mapped streets are marked as lit"}]

    if not is_day and lit_share < 0.75:
        notes[0]["text"] += " (this matters more because it is currently dark)"

    return score, notes


def score_road_safety(metrics, mode):
    """
    Traffic exposure for people on foot or bicycle. Averages whichever
    of these have enough data: sidewalks, speed limits, and the share of
    the route on fast main roads (always available when roads are).
    """

    if mode == "driving":
        return None, []

    major = metrics.get("major_road_share")

    if major is None:
        return _missing("Road data was unavailable, so traffic exposure was not scored")

    parts = []
    notes = []

    # ---- share on fast main roads ----

    parts.append(100 * (1 - major))

    if major >= 0.5:
        notes.append({"impact": "negative", "text": f"{_pct(major)} of the route follows main roads with faster traffic"})
    elif major <= 0.15:
        notes.append({"impact": "positive", "text": "The route mostly avoids main roads with fast traffic"})

    # ---- sidewalks ----

    sidewalk = metrics.get("sidewalk_share")
    sidewalk_coverage = metrics.get("sidewalk_coverage")

    if (
        mode == "walking"
        and sidewalk is not None
        and sidewalk_coverage is not None
        and sidewalk_coverage >= MIN_TAG_COVERAGE
    ):
        parts.append(100 * sidewalk)

        if sidewalk >= 0.6:
            notes.append({"impact": "positive", "text": f"Sidewalks are mapped along {_pct(sidewalk)} of the streets with sidewalk data"})
        elif sidewalk < 0.3:
            notes.append({"impact": "negative", "text": "Many streets on this route are mapped without sidewalks"})
    elif mode == "walking":
        notes.append({"impact": "neutral", "text": "Sidewalk data is mostly unmapped for this route, so it was not scored"})

    # ---- speed limits ----

    speed = metrics.get("maxspeed_mean_kmh")
    speed_coverage = metrics.get("maxspeed_coverage")

    if speed is not None and speed_coverage is not None and speed_coverage >= MIN_TAG_COVERAGE:
        # 30 km/h or less is fully calm; 80 km/h or more scores zero.
        parts.append(max(0.0, min(100.0, (80 - speed) / 50 * 100)))

        if speed >= 60:
            notes.append({"impact": "negative", "text": f"Posted speed limits average {round(speed)} km/h along this route"})
        elif speed <= 40:
            notes.append({"impact": "positive", "text": f"Posted speed limits are low (about {round(speed)} km/h)"})

    return sum(parts) / len(parts), notes


def score_weather(weather):

    if not weather:
        return _missing("Weather data was unavailable, so it was not scored")

    score = 100.0
    notes = []

    precipitation = weather.get("precipitation") or 0
    wind = weather.get("wind_speed") or 0
    visibility = weather.get("visibility")
    code = weather.get("weather_code") or 0

    if precipitation > 7.5:
        score -= 55
        notes.append({"impact": "negative", "text": f"Heavy rain ({precipitation} mm)"})
    elif precipitation > 2:
        score -= 35
        notes.append({"impact": "negative", "text": f"Moderate rain ({precipitation} mm)"})
    elif precipitation > 0.2:
        score -= 15
        notes.append({"impact": "negative", "text": f"Light rain ({precipitation} mm)"})
    else:
        notes.append({"impact": "positive", "text": "Low precipitation"})

    if wind > 50:
        score -= 35
        notes.append({"impact": "negative", "text": f"Strong winds ({round(wind)} km/h)"})
    elif wind > 30:
        score -= 15
        notes.append({"impact": "negative", "text": f"Windy conditions ({round(wind)} km/h)"})
    else:
        notes.append({"impact": "positive", "text": f"Calm to moderate wind ({round(wind)} km/h)"})

    if code >= 95:
        score -= 40
        notes.append({"impact": "negative", "text": "Thunderstorm activity reported"})

    if code in (45, 48) or (visibility is not None and visibility < 1000):
        score -= 25
        notes.append({"impact": "negative", "text": "Reduced visibility (fog or haze)"})

    return max(0.0, score), notes


# ==================================================
# COMBINED SCORE
# ==================================================

def calculate_safety_score(metrics, weather, mode="walking"):
    """
    metrics: measurements from route_analyzer.measure_route
    weather: averaged weather reading for the route, or None
    """

    is_day = True if not weather else weather.get("is_day", True)

    weights = WEIGHTS[(mode, is_day)]

    results = {
        "emergency": score_emergency(metrics),
        "activity": score_activity(metrics),
        "surroundings": score_surroundings(metrics),
        "lighting": score_lighting(metrics, is_day),
        "road_safety": score_road_safety(metrics, mode),
        "weather": score_weather(weather),
    }

    # Factors that do not apply to this travel mode are reported as
    # such, not as missing data.
    not_applicable = [key for key, weight in weights.items() if weight == 0]

    for key in not_applicable:
        results[key] = (None, [])

    available_weight = sum(
        weights[key]
        for key, (score, _) in results.items()
        if score is not None
    )

    factors = []
    explanations = []

    for key, (score, notes) in results.items():

        factors.append({
            "key": key,
            "label": FACTOR_LABELS[key],
            "score": None if score is None else round(score),
            "weight": weights[key],
            "available": score is not None,
            "applicable": key not in not_applicable,
        })

        explanations.extend(notes)

    if not is_day:
        explanations.append({
            "impact": "negative",
            "text": (
                "It is currently dark, so street lighting counts for more"
                if mode == "driving"
                else "It is currently dark, so lighting and street activity count for more"
            ),
        })

    has_map_data = any(
        results[key][0] is not None for key in MAP_FACTORS
    )

    # With too little evidence (e.g. weather only) a number would
    # overstate what we know.
    if available_weight < MIN_SCORED_WEIGHT or not has_map_data:
        return {
            "safety_score": None,
            "risk_level": "Insufficient data",
            "data_confidence": "low",
            "factors": factors,
            "explanations": explanations,
        }

    total = sum(
        weights[key] * score
        for key, (score, _) in results.items()
        if score is not None
    ) / available_weight

    if available_weight >= 0.85:
        confidence = "high"
    elif available_weight >= 0.55:
        confidence = "medium"
    else:
        confidence = "low"

    # Positives first, then neutral notes, then concerns.
    order = {"positive": 0, "neutral": 1, "negative": 2}
    explanations.sort(key=lambda note: order[note["impact"]])

    return {
        "safety_score": round(total),
        "risk_level": risk_level(total),
        "data_confidence": confidence,
        "factors": factors,
        "explanations": explanations,
    }


# ==================================================
# ROUTE CATEGORIES AND RECOMMENDATION
# ==================================================

def _quickest(routes):
    return min(routes, key=lambda r: (r["duration_min"], r["distance_km"]))


# How much the AI/ML risk model (ml/risk_model.py; trained on real UK
# STATS19 pedestrian/cyclist collision data, since no Kerala-specific
# incident dataset exists) may move the RANKING score away from the
# rule-based score. The rule-based score itself ("safety_score", shown
# to the user and used for data_confidence) is never changed by this;
# it only affects which route categorize_routes tags safest/balanced.
# Kept modest and named so the exact influence is auditable, and
# reflects the model's own, honestly modest, validated predictive
# power (ml/README.md, ml/risk_features.py).
ML_RANKING_WEIGHT = 0.25


def _ranking_score(route):
    """
    The rule-based score, nudged toward the AI/ML risk model's view
    when a trained, validated model produced one ("ready") for this
    route; otherwise exactly the rule-based score - identical ranking
    behaviour to having no AI/ML risk model at all (the normal state
    until ml.train_risk_model has been run; see ml/risk_model.py).
    """

    score = route.get("safety_score")

    if score is None:
        return None

    ml = route.get("ml_risk_assessment") or {}

    if ml.get("status") != "ready":
        return score

    # Higher predicted_severe_share -> lower ML-implied safety, on the
    # same 0-100 scale as the rule-based score.
    ml_equivalent = 100 * (1 - ml["predicted_severe_share"])

    return (1 - ML_RANKING_WEIGHT) * score + ML_RANKING_WEIGHT * ml_equivalent


def categorize_routes(routes):
    """
    Tags routes "safest", "balanced" and "fastest" (a route can hold
    several tags) and decides the recommendation. Deterministic:

      fastest   the quickest route (ties: the higher ranking score).
      safest    the quickest route among those within SCORE_TIE_MARGIN
                points of the highest ranking score.
      balanced  the best mix of safety (50%), time (30%) and distance
                (20%) among scored routes.

    "Ranking score" is the rule-based score, boundedly adjusted by the
    AI/ML risk model when one is trained and ready (_ranking_score);
    the rule-based "safety_score" shown to the user is never itself
    changed. This is the AI/ML model's one, deliberately bounded,
    point of real influence on the product: which routes end up within
    the tie margin of the top, and the mix behind "balanced".

    The recommendation is the safest route, but ONLY when that is
    defensible: some route must have a score, and the best score must
    not rest on low-confidence rule-based data (AI/ML confidence is
    not part of this gate - the rule-based engine remains the
    authority on whether there is enough evidence at all). Otherwise
    there is no recommendation ("unavailable") and the quickest route
    is merely the default selection, never labelled as a safety
    recommendation.

    Returns {"state", "route_id", "reason", "default_route_id"}:
      state  recommended | tie | close | single | unavailable
    """

    for route in routes:
        route["categories"] = []
        route["ranking_score"] = _ranking_score(route)

    if not routes:
        return {"state": "unavailable", "route_id": None, "reason": None, "default_route_id": None}

    fastest = min(
        routes,
        key=lambda r: (r["duration_min"], -(r["ranking_score"] or 0), r["distance_km"]),
    )
    fastest["categories"].append("fastest")

    scored = [r for r in routes if r.get("safety_score") is not None]

    if not scored:
        return {
            "state": "unavailable",
            "route_id": None,
            "reason": (
                "Safety data is currently unavailable, so no route can be "
                "recommended as safest. The quickest route is selected."
            ),
            "default_route_id": fastest["id"],
        }

    top_score = max(r["ranking_score"] for r in scored)
    near_top = [r for r in scored if top_score - r["ranking_score"] <= SCORE_TIE_MARGIN]
    safest = _quickest(near_top)
    safest["categories"].append("safest")

    min_duration = min(r["duration_min"] for r in scored) or 1
    min_distance = min(r["distance_km"] for r in scored) or 1

    for route in scored:
        route["balance_score"] = round(
            0.5 * route["ranking_score"]
            + 0.3 * 100 * min_duration / max(route["duration_min"], 0.1)
            + 0.2 * 100 * min_distance / max(route["distance_km"], 0.01),
            1,
        )

    balanced = max(scored, key=lambda r: (r["balance_score"], -r["duration_min"]))
    balanced["categories"].append("balanced")

    # ---- is a recommendation defensible? ----

    if CONFIDENCE_RANK[safest.get("data_confidence", "low")] == 0:
        return {
            "state": "unavailable",
            "route_id": None,
            "reason": (
                "Too much safety data was unavailable to recommend a safest "
                "route with confidence. The quickest route is selected."
            ),
            "default_route_id": fastest["id"],
        }

    others = [r for r in scored if r is not safest]

    if not others:
        return {
            "state": "single",
            "route_id": safest["id"],
            "reason": "This was the only distinct route found for this trip.",
            "default_route_id": safest["id"],
        }

    best_other = max(r["ranking_score"] for r in others)
    gap = round(safest["ranking_score"] - best_other, 1)

    if gap <= SCORE_TIE_MARGIN and len(near_top) > 1:
        state = "tie"
        reason = (
            "Several routes have practically the same safety score, so the "
            "quickest of them is recommended."
        )
    elif gap >= 5:
        state = "recommended"
        reason = (
            f"Highest safety score of the {len(routes)} routes "
            f"({gap} points ahead of the next best)."
        )
    else:
        state = "close"
        reason = (
            f"Highest safety score of the {len(routes)} routes, though the "
            "scores are close - compare the alternatives if time matters more."
        )

    return {
        "state": state,
        "route_id": safest["id"],
        "reason": reason,
        "default_route_id": safest["id"],
    }
