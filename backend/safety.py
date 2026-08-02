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