from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware

from pydantic import BaseModel
from sqlalchemy.orm import Session


# ==================================================
# DATABASE
# ==================================================

from database import engine, get_db

from models import Base, Route


# ==================================================
# SAFETY SYSTEM
# ==================================================

from safety import (
    calculate_safety_score,
    compare_routes,
    recommend_best_route
)


# ==================================================
# ROUTING
# ==================================================

from routing_service import (
    get_alternative_routes
)


# ==================================================
# ROUTE ANALYSIS
# ==================================================

from route_analyzer import (
    analyze_all_routes
)


# ==================================================
# CREATE DATABASE TABLES
# ==================================================

Base.metadata.create_all(
    bind=engine
)


# ==================================================
# FASTAPI APPLICATION
# ==================================================

app = FastAPI(

    title="LumaPath API",

    description=(
        "Safety-Aware Route Recommendation Backend"
    ),

    version="1.0.0"

)


# ==================================================
# CORS
#
# Allows React frontend to communicate
# with FastAPI.
# ==================================================

app.add_middleware(

    CORSMiddleware,

    allow_origins=[

        "http://localhost:5173",

        "http://127.0.0.1:5173"

    ],

    allow_credentials=True,

    allow_methods=["*"],

    allow_headers=["*"]

)


# ==================================================
# HOME
# ==================================================

@app.get("/")
def home():

    return {

        "message":
        "LumaPath Backend is running"

    }


# ==================================================
# PYDANTIC MODELS
# ==================================================


# --------------------------------------------------
# ROUTE DATABASE DATA
# --------------------------------------------------

class RouteData(BaseModel):

    source: str

    destination: str


    source_lat: float

    source_lon: float


    destination_lat: float

    destination_lon: float


    distance: float

    duration: float

    safety_score: float


# --------------------------------------------------
# BASIC SAFETY DATA
# --------------------------------------------------

class SafetyData(BaseModel):

    hospitals: int

    police_stations: int

    precipitation: float

    wind_speed: float


# --------------------------------------------------
# ONE ROUTE FOR MANUAL SAFETY COMPARISON
# --------------------------------------------------

class RouteSafetyData(BaseModel):

    name: str

    hospitals: int

    police_stations: int

    precipitation: float

    wind_speed: float


# --------------------------------------------------
# MULTIPLE ROUTES
# --------------------------------------------------

class RouteComparisonData(BaseModel):

    routes: list[RouteSafetyData]


# --------------------------------------------------
# REAL ROUTING REQUEST
# --------------------------------------------------

class RouteRequest(BaseModel):

    source_lat: float

    source_lon: float

    destination_lat: float

    destination_lon: float


# ==================================================
# DATABASE ENDPOINT
# SAVE ROUTE
# ==================================================

@app.post("/route")
def create_route(

    route: RouteData,

    db: Session = Depends(get_db)

):


    new_route = Route(

        source=route.source,

        destination=route.destination,


        source_lat=route.source_lat,

        source_lon=route.source_lon,


        destination_lat=
        route.destination_lat,

        destination_lon=
        route.destination_lon,


        distance=route.distance,

        duration=route.duration,

        safety_score=route.safety_score

    )


    db.add(
        new_route
    )


    db.commit()


    db.refresh(
        new_route
    )


    return {

        "message":
        "Route saved successfully",

        "route_id":
        new_route.id

    }


# ==================================================
# DATABASE ENDPOINT
# GET SAVED ROUTES
# ==================================================

@app.get("/routes")
def get_routes(

    db: Session = Depends(get_db)

):

    routes = (
        db.query(Route)
        .all()
    )


    return routes


# ==================================================
# BASIC SAFETY ANALYSIS
# ==================================================

@app.post("/safety/analyze")
def analyze_safety(

    data: SafetyData

):


    result = calculate_safety_score(

        hospitals=
        data.hospitals,

        police_stations=
        data.police_stations,

        precipitation=
        data.precipitation,

        wind_speed=
        data.wind_speed

    )


    return result


# ==================================================
# MANUAL ROUTE COMPARISON
# ==================================================

@app.post("/safety/compare")
def compare_route_safety(

    data: RouteComparisonData

):


    routes = [

        route.model_dump()

        for route in data.routes

    ]


    result = compare_routes(
        routes
    )


    return result


# ==================================================
# REAL OSRM ALTERNATIVE ROUTES
#
# This endpoint ONLY gets routes.
# It does not perform safety analysis.
# ==================================================

@app.post("/routes/alternatives")
async def alternative_routes(

    data: RouteRequest

):


    routes = await get_alternative_routes(

        source_lat=
        data.source_lat,

        source_lon=
        data.source_lon,


        destination_lat=
        data.destination_lat,

        destination_lon=
        data.destination_lon

    )


    return {

        "total_routes":
        len(routes),

        "routes":
        routes

    }


# ==================================================
# MAIN LUMAPATH SAFE ROUTE ENDPOINT
# ==================================================

@app.post("/safe-route")
async def find_safe_route(

    data: RouteRequest

):


    # ==================================================
    # STEP 1
    #
    # Get REAL road alternatives from OSRM
    # ==================================================

    routes = await get_alternative_routes(

        source_lat=
        data.source_lat,

        source_lon=
        data.source_lon,


        destination_lat=
        data.destination_lat,

        destination_lon=
        data.destination_lon

    )


    # ==================================================
    # STEP 2
    #
    # Make sure OSRM returned something.
    # ==================================================

    if not routes:

        return {

            "message":
            "No routes found",

            "total_routes":
            0,

            "recommended_route":
            None,

            "routes":
            []

        }


    print(
        "Routes entering safety analysis:",
        len(routes)
    )


    # ==================================================
    # STEP 3
    #
    # Analyze EVERY route.
    #
    # route_analyzer.py obtains:
    #
    # hospitals
    # police stations
    # precipitation
    # wind
    #
    # and calculates safety score.
    # ==================================================

    analyzed_routes = (
        await analyze_all_routes(
            routes
        )
    )


    print(
        "Routes after safety analysis:",
        len(analyzed_routes)
    )


    # ==================================================
    # STEP 4
    #
    # Select BEST PRACTICAL ROUTE.
    #
    # IMPORTANT:
    #
    # Previously we used:
    #
    # max(safety_score)
    #
    # Now we use our recommendation function.
    #
    # It considers:
    #
    # Safety
    # +
    # Distance
    # +
    # Duration
    # ==================================================

    recommended_route = (
        recommend_best_route(
            analyzed_routes
        )
    )


    # ==================================================
    # STEP 5
    #
    # Debug recommended route
    # ==================================================

    if recommended_route:

        print("\n")

        print(
            "LumaPath recommended:",
            recommended_route["name"]
        )

        print(
            "Safety score:",
            recommended_route[
                "safety_score"
            ]
        )

        print(
            "Recommendation score:",
            recommended_route[
                "recommendation_score"
            ]
        )

        print("\n")


    # ==================================================
    # STEP 6
    #
    # SEND EVERYTHING TO REACT
    # ==================================================

    return {

        "total_routes":
        len(analyzed_routes),

        "recommended_route":
        recommended_route,

        "routes":
        analyzed_routes

    }