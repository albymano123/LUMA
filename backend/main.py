from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from routing_service import get_alternative_routes
from route_analyzer import analyze_all_routes


# ==================================================
# CREATE FASTAPI APPLICATION
# ==================================================

app = FastAPI(
    title="LumaPath API",
    description="AI-Powered Safety Navigation Backend",
    version="1.0.0"
)


# ==================================================
# CORS
# ==================================================
#
# React/Vite runs on localhost:5173 normally.
#
# We allow both localhost and 127.0.0.1 because
# browsers treat them as different origins.
#
# ==================================================

app.add_middleware(
    CORSMiddleware,

    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",

        "http://localhost:5174",
        "http://127.0.0.1:5174",

        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],

    allow_credentials=True,

    allow_methods=["*"],

    allow_headers=["*"],
)


# ==================================================
# REQUEST MODEL
# ==================================================

class RouteRequest(BaseModel):

    source_lat: float

    source_lon: float

    destination_lat: float

    destination_lon: float


# ==================================================
# ROOT
# ==================================================

@app.get("/")
async def root():

    return {
        "message": "LumaPath Backend is running",
        "status": "OK"
    }


# ==================================================
# HEALTH CHECK
# ==================================================

@app.get("/health")
async def health():

    return {
        "status": "healthy"
    }


# ==================================================
# SAFE ROUTE
# ==================================================

@app.post("/safe-route")
async def safe_route(
    request: RouteRequest
):

    print()
    print(
        "======================================"
    )

    print(
        "LUMAPATH SAFE ROUTE REQUEST"
    )

    print(
        "======================================"
    )

    print(
        "Source:",
        request.source_lat,
        request.source_lon
    )

    print(
        "Destination:",
        request.destination_lat,
        request.destination_lon
    )


    # ==================================================
    # GET ROUTES FROM OSRM
    # ==================================================

    try:

        routes = await get_alternative_routes(

            request.source_lat,

            request.source_lon,

            request.destination_lat,

            request.destination_lon

        )

    except Exception as error:

        print(
            "OSRM routing error:",
            error
        )

        raise HTTPException(

            status_code=500,

            detail={
                "message":
                "Unable to calculate routes",

                "error":
                str(error)
            }

        )


    # ==================================================
    # CHECK ROUTES
    # ==================================================

    if not routes:

        raise HTTPException(

            status_code=404,

            detail={
                "message":
                "No routes found"
            }

        )


    print(
        "Routes returned by OSRM:",
        len(routes)
    )


    # ==================================================
    # ANALYZE EACH ROUTE
    #
    # This is where:
    #
    # Route geometry
    #       ↓
    # Hospitals along route
    # Police stations along route
    # Weather
    # Safety score
    #
    # are calculated.
    # ==================================================

    try:

        analyzed_routes = (

            await analyze_all_routes(
                routes
            )

        )

    except Exception as error:

        print(
            "Route analysis error:",
            error
        )

        raise HTTPException(

            status_code=500,

            detail={
                "message":
                "Unable to analyze routes",

                "error":
                str(error)
            }

        )


    # ==================================================
    # FIND SAFEST ROUTE
    # ==================================================

    if not analyzed_routes:

        raise HTTPException(

            status_code=404,

            detail={
                "message":
                "No analyzed routes available"
            }

        )


    # Highest safety score is recommended.
    #
    # If two routes have the same score,
    # shorter distance is preferred.
    #
    recommended_route = max(

        analyzed_routes,

        key=lambda route: (

            route.get(
                "safety_score",
                0
            ),

            -route.get(
                "distance_km",
                float("inf")
            )

        )

    )


    print()
    print(
        "RECOMMENDED ROUTE:"
    )

    print(
        recommended_route["name"]
    )

    print(
        "Safety Score:",
        recommended_route.get(
            "safety_score"
        )
    )

    print(
        "Risk Level:",
        recommended_route.get(
            "risk_level"
        )
    )

    print(
        "Hospitals:",
        recommended_route.get(
            "hospital_count",
            0
        )
    )

    print(
        "Police Stations:",
        recommended_route.get(
            "police_station_count",
            0
        )
    )


    print(
        "======================================"
    )


    # ==================================================
    # RESPONSE
    # ==================================================

    return {

        "success": True,

        "total_routes":
        len(analyzed_routes),

        "routes":
        analyzed_routes,

        "recommended_route":
        recommended_route

    }


# ==================================================
# RUN DIRECTLY
# ==================================================

if __name__ == "__main__":

    import uvicorn

    uvicorn.run(

        "main:app",

        host="0.0.0.0",

        port=8000,

        reload=True

    )