from safety import calculate_safety_score
from fastapi import FastAPI, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import engine, get_db
from models import Base, Route


Base.metadata.create_all(bind=engine)

app = FastAPI()


@app.get("/")
def home():
    return {
        "message": "LumaPath Backend is running"
    }


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
class SafetyData(BaseModel):
    hospitals: int
    police_stations: int
    precipitation: float
    wind_speed: float

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
        destination_lat=route.destination_lat,
        destination_lon=route.destination_lon,
        distance=route.distance,
        duration=route.duration,
        safety_score=route.safety_score
    )

    db.add(new_route)
    db.commit()
    db.refresh(new_route)

    return {
        "message": "Route saved successfully",
        "route_id": new_route.id
    }
@app.get("/routes")
def get_routes(db: Session = Depends(get_db)):

    routes = db.query(Route).all()

    return routes
@app.post("/safety/analyze")
def analyze_safety(data: SafetyData):

    result = calculate_safety_score(
        hospitals=data.hospitals,
        police_stations=data.police_stations,
        precipitation=data.precipitation,
        wind_speed=data.wind_speed
    )

    return result