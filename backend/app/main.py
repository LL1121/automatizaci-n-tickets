"""Aplicación FastAPI Fuel-Ops AI — Etapa 1."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.api.routes.admin import router as admin_router
from app.api.routes.upload import router as upload_router
from app.api.routes.vehicles import router as vehicles_router
from app.db.session import get_engine, get_session_factory, verify_database_connection
from app.models import Base, Ticket, Vehicle  # noqa: F401 - registro de metadatos SQLAlchemy
from app.services.seed_vehicles import seed_demo_vehicles_if_configured

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    logging.getLogger(__name__).info(
        "DB: user=%s host=%s db=%s",
        settings.postgres_user,
        settings.postgres_host,
        settings.postgres_db,
    )
    verify_database_connection()
    engine = get_engine()
    Base.metadata.create_all(bind=engine)
    with get_session_factory()() as db:
        seed_demo_vehicles_if_configured(db)
    yield


app = FastAPI(
    title="Fuel-Ops AI",
    description="API de ingesta y extracción inteligente de tickets de combustible.",
    version="0.1.0",
    lifespan=lifespan,
    redirect_slashes=False,
)


def _cors_allow_origins() -> list[str]:
    raw = get_settings().cors_origins.strip()
    if not raw:
        return ["*"]
    return [o.strip() for o in raw.split(",") if o.strip()]


_origins = _cors_allow_origins()

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload_router)
app.include_router(vehicles_router)
app.include_router(admin_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
