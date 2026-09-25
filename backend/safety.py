"""
Rule-based, explainable safety scoring.

Each route is scored on four factors, each 0-100:

  emergency  - how close the route stays to a hospital or clinic,
               and to a police station
  activity   - how much of the route passes shops, food places,
               transit stops etc. (a proxy for "other people around")
  lighting   - share of OpenStreetMap-tagged streets on the route
               that are marked as lit
  weather    - current rain, wind, storms and visibility

Factors are measured as a share of the route's length (not raw
counts), so a longer route does not look safer just because it
passes more buildings.

When a factor's data is unavailable it is left out and the remaining
weights are rescaled; the response reports this as lower confidence
instead of pretending the value is zero.

The score describes conditions based on available open data. It is
not a guarantee that a route is safe.
"""


# ==================================================
# WEIGHTS
# ==================================================
#
# At night lighting and activity matter more; weather matters
# relatively less. For drivers, street activity and lighting
# matter less than emergency access and weather.
#
# ==================================================

WEIGHTS = {
    ("walking", True): {"emergency": 0.30, "activity": 0.25, "lighting": 0.15, "weather": 0.30},
    ("walking", False): {"emergency": 0.25, "activity": 0.25, "lighting": 0.30, "weather": 0.20},
    ("cycling", True): {"emergency": 0.30, "activity": 0.20, "lighting": 0.15, "weather": 0.35},
    ("cycling", False): {"emergency": 0.25, "activity": 0.20, "lighting": 0.30, "weather": 0.25},
    # Street activity is not scored for drivers (weight 0): it says
    # little about safety inside a car, and it is the most expensive
    # data to fetch.
    ("driving", True): {"emergency": 0.45, "activity": 0.0, "lighting": 0.15, "weather": 0.40},
    ("driving", False): {"emergency": 0.40, "activity": 0.0, "lighting": 0.25, "weather": 0.35},
}

FACTOR_LABELS = {
    "emergency": "Emergency access",
    "activity": "Street activity",
    "lighting": "Street lighting",
    "weather": "Weather",
}

# Share of the total factor weight that must have data before we
# publish a score at all. Weather on its own never qualifies: at
# least one map-based factor must be present too.
MIN_SCORED_WEIGHT = 0.4
MAP_FACTORS = ("emergency", "activity", "lighting")

# Lighting needs a handful of tagged streets before we trust the ratio.
MIN_LIT_SEGMENTS = 4


def risk_level(score):

    if score >= 75:
        return "Lower risk"

    if score >= 55:
        return "Moderate risk"

    return "Higher risk"


def _pct(share):
    return f"{round(share * 100)}%"


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
        return None, [{
            "impact": "neutral",
            "text": "Emergency-service data is temporarily unavailable, so it was not scored",
        }]

    score = 100 * (0.5 * hospital + 0.5 * police)
    notes = []

    for access, noun, median_key in (
        (hospital, "hospitals or clinics", "hospital_median_m"),
        (police, "police stations", "police_median_m"),
    ):
        distance = _describe_distance(metrics.get(median_key))

        if access >= 0.75:
            notes.append({"impact": "positive", "text": f"Good availability of {noun} ({distance})"})
        elif access >= 0.4:
            notes.append({"impact": "neutral", "text": f"Moderate access to {noun} ({distance})"})
        else:
            notes.append({"impact": "negative", "text": f"Limited access to {noun} ({distance})"})

    return score, notes


def score_activity(metrics):

    coverage = metrics.get("activity_coverage")

    if coverage is None:
        return None, [{
            "impact": "neutral",
            "text": "Street-activity data is temporarily unavailable, so it was not scored",
        }]

    # 70% of the route passing shops / transit / food is treated as
    # fully "active"; few urban routes exceed that.
    score = min(100.0, coverage / 0.7 * 100)
    quiet = 1 - coverage

    if coverage >= 0.6:
        notes = [{"impact": "positive", "text": f"Busy surroundings: shops, food places or transit stops along {_pct(coverage)} of the route"}]
    elif coverage >= 0.3:
        notes = [{"impact": "negative", "text": f"Some sections may have lower activity (about {_pct(quiet)} of the route has few nearby shops or services)"}]
    else:
        notes = [{"impact": "negative", "text": f"Mostly quiet route: {_pct(quiet)} of it has few nearby shops, services or transit stops"}]

    longest_quiet = metrics.get("longest_quiet_km") or 0

    if coverage >= 0.3 and longest_quiet >= 0.5:
        notes.append({"impact": "negative", "text": f"Longest quiet stretch is about {longest_quiet} km"})

    return score, notes


def score_lighting(metrics, is_day):

    lit_ratio = metrics.get("lit_ratio")
    tagged = metrics.get("lit_tagged_segments", 0)

    if lit_ratio is None or tagged < MIN_LIT_SEGMENTS:
        return None, [{
            "impact": "neutral",
            "text": "Not enough street-lighting information is mapped for this route",
        }]

    score = lit_ratio * 100

    if lit_ratio >= 0.75:
        notes = [{"impact": "positive", "text": f"Most mapped streets on this route are lit ({_pct(lit_ratio)})"}]
    elif lit_ratio >= 0.4:
        notes = [{"impact": "neutral", "text": f"About {_pct(lit_ratio)} of mapped streets on this route are lit"}]
    else:
        notes = [{"impact": "negative", "text": f"Poor street lighting: only {_pct(lit_ratio)} of mapped streets are marked as lit"}]

    if not is_day and lit_ratio < 0.75:
        notes[0]["text"] += " (this matters more because it is currently dark)"

    return score, notes


def score_weather(weather):

    if not weather:
        return None, [{
            "impact": "neutral",
            "text": "Weather data is temporarily unavailable, so it was not scored",
        }]

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
    metrics: output of route_analyzer.measure_route
    weather: averaged weather reading for the route, or None
    """

    is_day = True if not weather else weather.get("is_day", True)

    weights = WEIGHTS[(mode, is_day)]

    results = {
        "emergency": score_emergency(metrics),
        "activity": score_activity(metrics),
        "lighting": score_lighting(metrics, is_day),
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
# ROUTE CATEGORIES
# ==================================================

def categorize_routes(routes):
    """
    Tags routes as "safest", "balanced" and "fastest" (a route can
    hold more than one tag) and returns the recommended route, which
    is always the safest one: LumaPath is safety-first, and the
    balanced / fastest options are one tap away.
    """

    scored = [r for r in routes if r.get("safety_score") is not None]

    for route in routes:
        route["categories"] = []

    if not routes:
        return None

    fastest = min(routes, key=lambda r: r["duration_min"])
    fastest["categories"].append("fastest")

    if not scored:
        return fastest

    # Ties go to the quicker route.
    safest = max(scored, key=lambda r: (r["safety_score"], -r["duration_min"]))
    safest["categories"].append("safest")

    min_duration = min(r["duration_min"] for r in scored) or 1
    min_distance = min(r["distance_km"] for r in scored) or 1

    for route in scored:
        route["balance_score"] = round(
            0.5 * route["safety_score"]
            + 0.3 * 100 * min_duration / max(route["duration_min"], 0.1)
            + 0.2 * 100 * min_distance / max(route["distance_km"], 0.01),
            1,
        )

    balanced = max(scored, key=lambda r: r["balance_score"])
    balanced["categories"].append("balanced")

    return safest
