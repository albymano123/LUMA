"""
Configuration, read once from environment variables (and backend/.env
in development). Nothing secret is required to run LumaPath: every
service it talks to is a free public API.

See .env.example for the full list.
"""

import os
from pathlib import Path

from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parent

load_dotenv(BASE_DIR / ".env")


def _list(name, default):
    return [item.strip() for item in os.getenv(name, default).split(",") if item.strip()]


def _int(name, default):
    try:
        return int(os.getenv(name, default))
    except ValueError:
        return int(default)


LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()

# Comma-separated list of browser origins allowed to call the API.
ALLOWED_ORIGINS = _list(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173,"
    "http://localhost:4173,http://127.0.0.1:4173",
)

# Local OpenStreetMap database (built by `python -m geodata.build`).
GEO_DB_PATH = os.getenv("GEO_DB_PATH", str(BASE_DIR / "data" / "kerala_geo.sqlite"))

# Outside the local database's area, fall back to the public Overpass
# servers (slower and less reliable). Set to "false" to disable.
OVERPASS_FALLBACK = os.getenv("OVERPASS_FALLBACK", "true").lower() != "false"

# Requests per client per minute.
RATE_LIMIT_ROUTES = _int("RATE_LIMIT_ROUTES_PER_MIN", "20")
RATE_LIMIT_SEARCH = _int("RATE_LIMIT_SEARCH_PER_MIN", "90")
RATE_LIMIT_REVERSE = _int("RATE_LIMIT_REVERSE_PER_MIN", "30")

# How far from a route to look for emergency services (metres). The
# emergency-access score falls to zero at this distance.
EMERGENCY_RADIUS_M = {"walking": 2000, "cycling": 3000, "driving": 5000}

# Places within this distance of the route count as "street activity".
ACTIVITY_RADIUS_M = 100

# A route within this many buildings-per-150m-block is "unbuilt".
BUILT_UP_MIN_BUILDINGS = 3

# Behind a proxy (Render, Fly, nginx) the client address is in
# X-Forwarded-For; only trust it when actually deployed behind one.
TRUST_PROXY = os.getenv("TRUST_PROXY", "false").lower() == "true"

HOST = os.getenv("HOST", "127.0.0.1")
PORT = _int("PORT", "8000")

# When set to a folder containing the built frontend (frontend/dist),
# the API also serves the web app, so one service hosts everything.
STATIC_DIR = os.getenv("STATIC_DIR", "")
