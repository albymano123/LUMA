from sqlalchemy import Column, Integer, String, Float
from sqlalchemy.orm import declarative_base


Base = declarative_base()


class Route(Base):
    __tablename__ = "routes"

    id = Column(Integer, primary_key=True, index=True)

    source = Column(String, nullable=False)
    destination = Column(String, nullable=False)

    source_lat = Column(Float)
    source_lon = Column(Float)

    destination_lat = Column(Float)
    destination_lon = Column(Float)

    distance = Column(Float)
    duration = Column(Float)

    safety_score = Column(Float)