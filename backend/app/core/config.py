from functools import lru_cache
from pathlib import Path

from pydantic import Field, PostgresDsn, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: PostgresDsn = Field(
        ...,
        alias="DATABASE_URL",
        description="SQLAlchemy PostgreSQL connection URL",
    )
    google_api_key: str = Field(default="", alias="GOOGLE_API_KEY")
    upload_dir: Path = Field(default=Path("./uploads"), alias="UPLOAD_DIR")
    gemini_model: str = Field(default="gemini-1.5-flash", alias="GEMINI_MODEL")
    seed_demo_vehicles_if_empty: bool = Field(
        default=True,
        alias="FUEL_OPS_SEED_VEHICLES",
        description="Si no hay vehículos en DB, insertar filas demo para operadores de campo.",
    )
    cors_origins: str = Field(
        default="",
        alias="CORS_ORIGINS",
        description="Orígenes permitidos separados por coma. Vacío = cualquier origen (sin credenciales CORS).",
    )

    @field_validator("upload_dir", mode="before")
    @classmethod
    def coerce_upload_dir(cls, v: str | Path) -> Path:
        return Path(v)


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
