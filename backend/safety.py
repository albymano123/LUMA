def calculate_safety_score(
    hospitals: int,
    police_stations: int,
    precipitation: float,
    wind_speed: float
):
    # Start with maximum safety
    score = 100

    # Emergency-service availability
    if hospitals == 0:
        score -= 15
    elif hospitals < 3:
        score -= 5

    if police_stations == 0:
        score -= 20
    elif police_stations < 2:
        score -= 10

    # Weather risk
    if precipitation > 10:
        score -= 15
    elif precipitation > 5:
        score -= 8

    if wind_speed > 40:
        score -= 10
    elif wind_speed > 25:
        score -= 5

    # Keep score between 0 and 100
    score = max(0, min(100, score))

    if score >= 80:
        risk_level = "Low Risk"
    elif score >= 60:
        risk_level = "Moderate Risk"
    else:
        risk_level = "High Risk"

    return {
        "safety_score": score,
        "risk_level": risk_level
    }
def compare_routes(routes):
    analyzed_routes = []

    for route in routes:
        safety = calculate_safety_score(
            hospitals=route["hospitals"],
            police_stations=route["police_stations"],
            precipitation=route["precipitation"],
            wind_speed=route["wind_speed"]
        )

        analyzed_routes.append({
            **route,
            "safety_score": safety["safety_score"],
            "risk_level": safety["risk_level"]
        })

    safest_route = max(
        analyzed_routes,
        key=lambda route: route["safety_score"]
    )

    return {
        "routes": analyzed_routes,
        "recommended_route": safest_route
    }
def calculate_recommendation_score(
    safety_score,
    distance_km,
    duration_min
):
    # Safety has the highest importance
    safety_component = safety_score * 0.70

    # Penalize unnecessarily long routes
    distance_penalty = distance_km * 0.10

    # Penalize unnecessarily slow routes
    duration_penalty = duration_min * 0.05

    recommendation_score = (
        safety_component
        - distance_penalty
        - duration_penalty
    )

    return round(recommendation_score, 2)


def recommend_best_route(routes):
    if not routes:
        return None

    for route in routes:
        route["recommendation_score"] = (
            calculate_recommendation_score(
                safety_score=route["safety_score"],
                distance_km=route["distance_km"],
                duration_min=route["duration_min"]
            )
        )

    best_route = max(
        routes,
        key=lambda route: route["recommendation_score"]
    )

    return best_route