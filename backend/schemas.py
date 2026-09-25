"""
The API contract: request and response models for /safe-route.

Typed models keep the response shape from drifting away from what
the frontend expects, and they document the API at /docs.
"""

from typing import Any, Literal

from pydantic import BaseModel, Field


class RouteRequest(BaseModel):

    source_lat: float = Field(ge=-90, le=90, allow_inf_nan=False)
    source_lon: float = Field(ge=-180, le=180, allow_inf_nan=False)
    destination_lat: float = Field(ge=-90, le=90, allow_inf_nan=False)
    destination_lon: float = Field(ge=-180, le=180, allow_inf_nan=False)
    mode: Literal["walking", "cycling", "driving"] = "walking"


class Factor(BaseModel):
    key: str
    label: str
    score: int | None = Field(description="0-100, or null when the data was unavailable")
    weight: float
    available: bool
    applicable: bool = Field(description="false when the factor does not apply to this travel mode")


class Explanation(BaseModel):
    impact: Literal["positive", "neutral", "negative"]
    text: str


class EmergencyService(BaseModel):
    id: str
    kind: Literal["hospital", "clinic", "police", "fire_station"]
    name: str | None = None
    phone: str | None = None
    emergency_ward: bool = False
    lat: float
    lon: float
    distance_m: int
    along_route_km: float


class Geometry(BaseModel):
    type: Literal["LineString"]
    coordinates: list[list[float]] = Field(description="[longitude, latitude] pairs")


class RouteResult(BaseModel):
    id: str
    name: str
    mode: str
    distance_km: float
    duration_min: float
    geometry: Geometry
    via_roads: list[str] = []
    generated_via_point: bool = False

    safety_score: int | None = Field(description="null when there is not enough data to score honestly")
    risk_level: str
    data_confidence: Literal["high", "medium", "low"]
    factors: list[Factor]
    explanations: list[Explanation]
    categories: list[Literal["safest", "balanced", "fastest"]]
    balance_score: float | None = None

    metrics: dict[str, Any]
    weather: dict[str, Any] | None = None
    emergency_services: list[EmergencyService]
    hospital_count: int
    police_station_count: int
    fire_station_count: int

    route_features: dict[str, Any] = Field(description="Environment facts from OpenStreetMap; not safety data")
    ml_estimate: dict[str, Any] = Field(description="Experimental; status 'not_trained' until real incident data exists")


class Recommendation(BaseModel):
    state: Literal["recommended", "tie", "close", "single", "unavailable"]
    route_id: str | None = Field(description="null when no safest route can be defended")
    reason: str | None = None
    default_route_id: str | None = Field(description="route to select first (recommended, else the quickest)")


class GeoSource(BaseModel):
    type: Literal["local", "live", "none"]
    label: str
    date: str | None = None


class SafeRouteResponse(BaseModel):
    success: bool
    mode: str
    total_routes: int
    routes: list[RouteResult]
    recommendation: Recommendation
    recommended_route_id: str | None
    recommendation_reason: str | None
    default_route_id: str | None
    data_sources: dict[str, bool]
    geo_source: GeoSource
    disclaimer: str
    generated_at: str


class ErrorDetail(BaseModel):
    message: str
    request_id: str | None = None
