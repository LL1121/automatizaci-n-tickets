"""Aplicación FastAPI Fuel-Ops AI — Etapa 1."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.admin import router as admin_router
from app.api.routes.upload import router as upload_router
from app.api.routes.vehicles import router as vehicles_router
from app.db.session import SessionLocal, engine
from app.models import Base, Ticket, Vehicle  # noqa: F401 - registro de metadatos SQLAlchemy
from app.services.seed_vehicles import seed_demo_vehicles_if_configured

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed_demo_vehicles_if_configured(db)
    yield


app = FastAPI(
    title="Fuel-Ops AI",
    description="API de ingesta y extracción inteligente de tickets de combustible.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload_router)
app.include_router(vehicles_router)
app.include_router(admin_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
