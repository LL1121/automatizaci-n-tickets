"""Aplicación FastAPI Fuel-Ops AI — Etapa 1."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.config import get_settings
from app.core.security import AuthConfigError
from app.api.routes.admin import auth_router as admin_auth_router
from app.api.routes.admin import router as admin_router
from app.api.routes.upload import router as upload_router
from app.api.routes.vehicles import router as vehicles_router
from app.db.schema_migrations import apply_schema_migrations
from app.db.session import get_engine, get_session_factory, verify_database_connection
from app.models import AdminUser, Base, FieldDevice, Ticket, Vehicle  # noqa: F401 - registro de metadatos SQLAlchemy
from app.api.routes.operators import router as operators_router
from app.services.admin_users import bootstrap_admin_from_env
from app.services.seed_vehicles import seed_demo_vehicles_if_configured

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def _cors_allow_origins() -> list[str]:
    raw = get_settings().cors_origins.strip()
    if not raw:
        return ["*"]
    return [o.strip() for o in raw.split(",") if o.strip()]


def _apply_cors_headers(response, origin: str | None) -> None:
    """Asegura cabeceras CORS también en respuestas de error (evita 'CORS missing' en 500)."""
    if not origin:
        return
    allowed = _cors_allow_origins()
    if "*" in allowed:
        response.headers["Access-Control-Allow-Origin"] = "*"
        return
    if origin in allowed:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers.setdefault("Vary", "Origin")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    logging.getLogger(__name__).info(
        "DB: user=%s host=%s db=%s",
        settings.postgres_user,
        settings.postgres_host,
        settings.postgres_db,
    )
    if not settings.jwt_secret.strip():
        logger.error(
            "JWT_SECRET está vacío: el login del panel admin fallará. "
            "Definilo en .env y recreá api (python -c \"import secrets; print(secrets.token_urlsafe(48))\").",
        )
    cors = _cors_allow_origins()
    logger.info("CORS allow_origins=%s", cors if cors != ["*"] else "* (todos)")

    verify_database_connection()
    engine = get_engine()
    Base.metadata.create_all(bind=engine)
    apply_schema_migrations(engine)
    with get_session_factory()() as db:
        seed_demo_vehicles_if_configured(db)
        bootstrap_admin_from_env(db)
    yield


app = FastAPI(
    title="Fuel-Ops AI",
    description="API de ingesta y extracción inteligente de tickets de combustible.",
    version="0.1.0",
    lifespan=lifespan,
    redirect_slashes=False,
)

_origins = _cors_allow_origins()

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


@app.middleware("http")
async def cors_on_error_responses(request: Request, call_next):
    """Capa extra: algunos 500 no pasaban CORS y el navegador solo mostraba 'blocked by CORS'."""
    origin = request.headers.get("origin")
    try:
        response = await call_next(request)
    except Exception:
        logger.exception("Error no capturado en %s %s", request.method, request.url.path)
        response = JSONResponse(
            status_code=500,
            content={"detail": "Error interno del servidor."},
        )
    _apply_cors_headers(response, origin)
    return response


@app.exception_handler(AuthConfigError)
async def auth_config_error_handler(request: Request, exc: AuthConfigError) -> JSONResponse:
    response = JSONResponse(
        status_code=503,
        content={"detail": str(exc)},
    )
    _apply_cors_headers(response, request.headers.get("origin"))
    return response


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    response = JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
    _apply_cors_headers(response, request.headers.get("origin"))
    return response


@app.exception_handler(StarletteHTTPException)
async def starlette_http_exception_handler(
    request: Request,
    exc: StarletteHTTPException,
) -> JSONResponse:
    response = JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
    _apply_cors_headers(response, request.headers.get("origin"))
    return response


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Excepción no manejada en %s %s", request.method, request.url.path)
    response = JSONResponse(
        status_code=500,
        content={"detail": "Error interno del servidor."},
    )
    _apply_cors_headers(response, request.headers.get("origin"))
    return response


app.include_router(upload_router)
app.include_router(vehicles_router)
app.include_router(operators_router)
app.include_router(admin_auth_router)
app.include_router(admin_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
