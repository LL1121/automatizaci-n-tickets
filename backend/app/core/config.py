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
        description="URL completa. En prod Lyntrix apunta a postgres_core.",
    )
    # Preferidos en prod (Lyntrix). Si faltan, se usan POSTGRES_*.
    db_user: str | None = Field(default=None, alias="DB_USER")
    db_password: str | None = Field(default=None, alias="DB_PASSWORD")
    db_name: str | None = Field(default=None, alias="DB_NAME")

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

    admin_username: str = Field(
        default="admin",
        alias="ADMIN_USERNAME",
        description="Usuario único del panel admin.",
    )
    admin_password: str = Field(
        default="",
        alias="ADMIN_PASSWORD",
        description="Contraseña del panel admin. Si está vacía, el login queda deshabilitado.",
    )
    jwt_secret: str = Field(
        default="",
        alias="JWT_SECRET",
        description="Secret para firmar JWT del admin. Debe definirse en producción.",
    )
    jwt_expires_minutes: int = Field(
        default=12 * 60,
        alias="JWT_EXPIRES_MINUTES",
        description="Minutos de vigencia del token admin (default 12 h).",
    )

    @field_validator("upload_dir", mode="before")
    @classmethod
    def coerce_upload_dir(cls, v: str | Path) -> Path:
        return Path(v)

    @model_validator(mode="after")
    def resolve_database_url(self) -> "Settings":
        user = (self.db_user or self.postgres_user).strip()
        password = self.db_password if self.db_password is not None else self.postgres_password
        database = (self.db_name or self.postgres_db).strip()
        host = self.postgres_host.strip()
        port = self.postgres_port

        object.__setattr__(self, "postgres_user", user)
        object.__setattr__(self, "postgres_password", password)
        object.__setattr__(self, "postgres_db", database)

        # Si DATABASE_URL apunta a postgres_core (u otro host remoto), respetarla
        # salvo que POSTGRES_HOST esté forzado por compose (siempre reconstruimos
        # desde piezas con encoding correcto — evita passwords rotas por $?@).
        built = build_database_url(
            user=user,
            password=password,
            host=host,
            port=port,
            database=database,
        )
        object.__setattr__(self, "database_url", built)
        return self

    @property
    def database_user_for_log(self) -> str:
        return self.postgres_user


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
