"""Saved statuses in Lakebase Postgres (ARCHITECTURE.md section 6).

The app creates its own schema at startup so its service principal owns it.
Without a Lakebase resource (local dev, or before slice 2), the store reports
itself disabled and every event shows its suggested status.
"""

from __future__ import annotations

import os
import threading
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Annotated, Any, TypeAlias
from uuid import UUID

import psycopg
from databricks.sdk import WorkspaceClient
from fastapi import FastAPI, Request
from psycopg.conninfo import make_conninfo
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from .core import logger
from .core._base import LifespanDependency

DDL = """
CREATE SCHEMA IF NOT EXISTS incident_desk;

CREATE TABLE IF NOT EXISTS incident_desk.event_status (
  event_type            text NOT NULL CHECK (event_type IN ('major_break','overflow_storm','low_chlorine','leak_alert')),
  event_id              text NOT NULL,
  status                text NOT NULL CHECK (status IN ('Open','In review','Actioned','Closed')),
  owner                 text,
  note                  text,
  regulator             text,
  regulator_notified_on date,
  version               integer NOT NULL DEFAULT 1,
  updated_by            text NOT NULL,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_type, event_id)
);

CREATE TABLE IF NOT EXISTS incident_desk.event_status_history (
  history_id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id            uuid NOT NULL UNIQUE,
  event_type            text NOT NULL,
  event_id              text NOT NULL,
  from_status           text,
  to_status             text NOT NULL,
  owner                 text,
  note                  text,
  regulator             text,
  regulator_notified_on date,
  accepted_suggestion   boolean NOT NULL DEFAULT false,
  changed_by            text NOT NULL,
  changed_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_status_history_event_idx
  ON incident_desk.event_status_history (event_type, event_id, changed_at DESC);
"""

_SELECT_STATUS = """SELECT event_type, event_id, status, owner, note, regulator, regulator_notified_on,
       version, updated_by, updated_at
FROM incident_desk.event_status"""

_UPSERT = """INSERT INTO incident_desk.event_status AS s
  (event_type, event_id, status, owner, note, regulator, regulator_notified_on, version, updated_by)
VALUES (%(event_type)s, %(event_id)s, %(status)s, %(owner)s, %(note)s, %(regulator)s,
        %(regulator_notified_on)s, 1, %(user)s)
ON CONFLICT (event_type, event_id) DO UPDATE
SET status = EXCLUDED.status, owner = EXCLUDED.owner, note = EXCLUDED.note,
    regulator = EXCLUDED.regulator, regulator_notified_on = EXCLUDED.regulator_notified_on,
    version = s.version + 1, updated_by = EXCLUDED.updated_by, updated_at = now()
WHERE s.version = %(expected_version)s
RETURNING event_type"""

_INSERT_HISTORY = """INSERT INTO incident_desk.event_status_history
  (request_id, event_type, event_id, from_status, to_status, owner, note, regulator,
   regulator_notified_on, accepted_suggestion, changed_by)
VALUES (%(request_id)s, %(event_type)s, %(event_id)s, %(from_status)s, %(status)s, %(owner)s,
        %(note)s, %(regulator)s, %(regulator_notified_on)s, %(accepted_suggestion)s, %(user)s)
ON CONFLICT (request_id) DO NOTHING"""


class StatusConflict(Exception):
    """Someone saved this event since the caller loaded it."""


@dataclass
class SavedStatus:
    event_type: str
    event_id: str
    status: str
    owner: str | None
    note: str | None
    regulator: str | None
    regulator_notified_on: date | None
    version: int
    updated_by: str
    updated_at: datetime


@dataclass
class StatusChange:
    event_type: str
    event_id: str
    status: str
    owner: str | None
    note: str | None
    regulator: str | None
    regulator_notified_on: date | None
    accepted_suggestion: bool
    expected_version: int
    request_id: UUID
    from_status: str
    user: str


class _Token:
    """OAuth token for Postgres, refreshed five minutes before it expires."""

    def __init__(self, ws: WorkspaceClient, endpoint: str):
        self._ws, self._endpoint = ws, endpoint
        self._lock = threading.Lock()
        self._value: str | None = None
        self._expires = datetime.min.replace(tzinfo=timezone.utc)

    def get(self) -> str:
        with self._lock:
            if self._value is None or datetime.now(timezone.utc) > self._expires - timedelta(minutes=5):
                credential = self._ws.postgres.generate_database_credential(endpoint=self._endpoint)
                assert credential.token
                self._value = credential.token
                expires = credential.expire_time.ToDatetime(timezone.utc) if credential.expire_time else None
                self._expires = expires or datetime.now(timezone.utc) + timedelta(minutes=50)
            return self._value


class StatusStore:
    def __init__(self) -> None:
        self.pool: ConnectionPool[Any] | None = None
        self.error: str | None = None

    @property
    def enabled(self) -> bool:
        return self.pool is not None

    def open(self) -> None:
        endpoint, host = os.environ.get("LAKEBASE_ENDPOINT"), os.environ.get("PGHOST")
        if not endpoint or not host:
            self.error = "Lakebase is not connected to this app yet."
            return
        token = _Token(WorkspaceClient(), endpoint)

        class _TokenConnection(psycopg.Connection):
            @classmethod
            def connect(cls, conninfo: str = "", **kwargs: Any):  # type: ignore[override]
                kwargs["password"] = token.get()
                return super().connect(conninfo, **kwargs)

        conninfo = make_conninfo(
            host=host,
            port=os.environ.get("PGPORT", "5432"),
            dbname=os.environ.get("PGDATABASE", "databricks_postgres"),
            user=os.environ.get("PGUSER", ""),
            sslmode=os.environ.get("PGSSLMODE", "require"),
        )
        pool = ConnectionPool(
            conninfo,
            connection_class=_TokenConnection,
            min_size=1,
            max_size=4,
            max_lifetime=45 * 60,
            check=ConnectionPool.check_connection,  # the endpoint may have suspended
            open=False,
        )
        try:
            pool.open(wait=True, timeout=30)
            with pool.connection() as conn, conn.transaction():
                conn.execute("SELECT pg_advisory_xact_lock(84641)")  # two workers start at once
                conn.execute(DDL)
        except Exception as exc:  # keep the app up; statuses fall back to suggestions
            logger.error(f"Lakebase unavailable: {exc}")
            self.error = "Lakebase is connected but not reachable. Statuses are read-only for now."
            pool.close()
            return
        self.pool = pool
        logger.info("Lakebase status store ready")

    def close(self) -> None:
        if self.pool:
            self.pool.close()

    def all(self) -> dict[tuple[str, str], SavedStatus]:
        if not self.pool:
            return {}
        with self.pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
            rows = cur.execute(_SELECT_STATUS).fetchall()
        return {(r["event_type"], r["event_id"]): SavedStatus(**r) for r in rows}

    def get(self, event_type: str, event_id: str) -> SavedStatus | None:
        if not self.pool:
            return None
        with self.pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
            row = cur.execute(
                _SELECT_STATUS + " WHERE event_type = %s AND event_id = %s", (event_type, event_id)
            ).fetchone()
        return SavedStatus(**row) if row else None

    def history(self, event_type: str, event_id: str) -> list[dict[str, Any]]:
        if not self.pool:
            return []
        with self.pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
            return cur.execute(
                """SELECT from_status, to_status, owner, note, regulator_notified_on,
                          accepted_suggestion, changed_by, changed_at
                   FROM incident_desk.event_status_history
                   WHERE event_type = %s AND event_id = %s
                   ORDER BY changed_at DESC, history_id DESC""",
                (event_type, event_id),
            ).fetchall()

    def save(self, change: StatusChange) -> None:
        """One transaction: a repeat of the same request is a no-op; a stale version is a conflict."""
        assert self.pool
        params = vars(change)
        with self.pool.connection() as conn, conn.transaction():
            seen = conn.execute(
                "SELECT 1 FROM incident_desk.event_status_history WHERE request_id = %s", (change.request_id,)
            ).fetchone()
            if seen:
                return
            if conn.execute(_UPSERT, params).fetchone() is None:
                raise StatusConflict()
            conn.execute(_INSERT_HISTORY, params)


class _StoreDependency(LifespanDependency):
    @asynccontextmanager
    async def lifespan(self, app: FastAPI) -> AsyncGenerator[None, None]:
        store = StatusStore()
        store.open()
        app.state.status_store = store
        try:
            yield
        finally:
            store.close()

    @staticmethod
    def __call__(request: Request) -> StatusStore:
        return request.app.state.status_store


StoreDependency: TypeAlias = Annotated[StatusStore, _StoreDependency.depends()]
