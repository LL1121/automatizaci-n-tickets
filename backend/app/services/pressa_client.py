"""Cliente HTTP de la telemetría en vivo de Pressa."""

from __future__ import annotations

import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)

_BASE = "https://interno.pressacloud.com/pressa_frontend_new"
_LOGIN_OK = "<!-- Redirect:dashboard -->"


class PressaError(Exception):
    """Pressa no autenticó o no devolvió la flota."""


class PressaClient:
    def __init__(self) -> None:
        self._http: httpx.AsyncClient | None = None
        self._logged_in = False

    async def aclose(self) -> None:
        if self._http is not None:
            await self._http.aclose()
        self._http = None
        self._logged_in = False

    async def _client(self) -> httpx.AsyncClient:
        if self._http is None:
            self._http = httpx.AsyncClient(timeout=30.0, follow_redirects=False)
        return self._http

    async def login(self) -> None:
        from app.core.config import get_settings

        settings = get_settings()
        username = settings.pressa_username.strip()
        password = settings.pressa_password
        if not username or not password:
            raise PressaError("Faltan PRESSA_USERNAME o PRESSA_PASSWORD")
        client = await self._client()
        try:
            resp = await client.post(
                f"{_BASE}/login/loginp.php",
                headers={
                    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                    "X-Requested-With": "XMLHttpRequest",
                },
                data={"username": username, "password": password},
            )
        except httpx.HTTPError as exc:
            self._logged_in = False
            raise PressaError("Pressa no respondió al login") from exc
        if resp.status_code in (401, 403) or _LOGIN_OK not in resp.text:
            self._logged_in = False
            raise PressaError("Pressa no aceptó el login")
        self._logged_in = True

    async def fetch_vehicles(self) -> list[dict[str, Any]]:
        if not self._logged_in:
            await self.login()
        resp = await self._post_list()
        if _needs_reauth(resp):
            self._logged_in = False
            await self.login()
            resp = await self._post_list()
        if _needs_reauth(resp):
            raise PressaError("Pressa volvió a pedir login")
        if resp.status_code >= 400:
            raise PressaError(f"Pressa respondió {resp.status_code}")
        try:
            data = resp.json()
        except ValueError as exc:
            raise PressaError("Pressa no devolvió JSON") from exc
        items = _vehicle_list(data)
        if items is None:
            raise PressaError("Pressa no trajo la lista de vehículos")
        return items

    async def _post_list(self) -> httpx.Response:
        client = await self._client()
        try:
            return await client.post(
                f"{_BASE}/dashboard/monitor_get_vehicles_list.php",
                headers={
                    "X-Requested-With": "XMLHttpRequest",
                    "Referer": f"{_BASE}/dashboard.php",
                },
            )
        except httpx.HTTPError as exc:
            raise PressaError("Pressa no respondió la flota") from exc


def _needs_reauth(resp: httpx.Response) -> bool:
    if resp.status_code in (401, 403):
        return True
    return "Redirect:login" in (resp.text or "")


def _vehicle_list(data: Any) -> list[dict[str, Any]] | None:
    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]
    if isinstance(data, dict):
        for key in ("vehicles", "data", "list", "rows"):
            value = data.get(key)
            if isinstance(value, list):
                return [item for item in value if isinstance(item, dict)]
    return None


_client: PressaClient | None = None


def get_pressa_client() -> PressaClient:
    global _client
    if _client is None:
        _client = PressaClient()
    return _client
