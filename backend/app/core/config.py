from functools import lru_cache
from pathlib import Path
from pydantic import Field, PostgresDsn, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.database_url import build_database_url


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: PostgresDsn | None = Field(
        default=None,
        alias="DATABASE_URL",
        description="URL completa. Si falta, se arma desde POSTGRES_* con encoding correcto.",
    )
    postgres_user: str = Field(default="fuelops", alias="POSTGRES_USER")
    postgres_password: str = Field(default="fuelops_dev", alias="POSTGRES_PASSWORD")
    postgres_host: str = Field(default="localhost", alias="POSTGRES_HOST")
    postgres_port: int = Field(default=5432, alias="POSTGRES_PORT")
    postgres_db: str = Field(default="fuelops", alias="POSTGRES_DB")

    google_api_key: str = Field(default="", alias="GOOGLE_API_KEY")
    upload_dir: Path = Field(default=Path("./uploads"), alias="UPLOAD_DIR")
    gemini_model: str = Field(
        default="gemini-2.0-flash-lite",
        alias="GEMINI_MODEL",
        description="Modelo con visión. Free tier: probar gemini-2.0-flash-lite.",
    )
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

    @model_validator(mode="after")
    def resolve_database_url(self) -> "Settings":
        # En Docker: misma fuente que el healthcheck (POSTGRES_*), no DATABASE_URL suelta.
        docker_db = self.postgres_host not in ("localhost", "127.0.0.1", "::1")
        if docker_db or self.database_url is None:
            built = build_database_url(
                user=self.postgres_user,
                password=self.postgres_password,
                host=self.postgres_host,
                port=self.postgres_port,
                database=self.postgres_db,
            )
            object.__setattr__(self, "database_url", built)
        return self

    @property
    def database_user_for_log(self) -> str:
        return self.postgres_user


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
