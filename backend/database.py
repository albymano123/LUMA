import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker


# Find .env specifically inside the backend folder
BASE_DIR = Path(__file__).resolve().parent
ENV_FILE = BASE_DIR / ".env"

load_dotenv(dotenv_path=ENV_FILE)

DATABASE_URL = os.getenv("DATABASE_URL")

# Check whether .env was loaded
if not DATABASE_URL:
    raise ValueError(
        f"DATABASE_URL was not found. Check this file: {ENV_FILE}"
    )


engine = create_engine(DATABASE_URL)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)


def get_db():
    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()


# Temporary connection test
try:
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
        print("Database connected successfully!")
except Exception as error:
    print("Database connection failed:")
    print(error)