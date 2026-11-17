"""Runs parameterised SQL on the warehouse as the app, with a short cache.

Every query the UI can show ("Show the query") lives in queries.py. Values are
always passed as named parameters (:name), never formatted into the SQL text.
"""

import os
import time
from collections.abc import Mapping
from typing import Any

from databricks.sdk import WorkspaceClient
from databricks.sdk.service.sql import (
    Disposition,
    StatementParameterListItem,
    StatementResponse,
    StatementState,
)

WAREHOUSE_ID = os.environ.get("WAREHOUSE_ID", "ace3100edf02c9ff")
SRC = "workshop_demo.water_utilities"  # demo data, read in place, never written
DESK = "adllabs_096.default"  # the desk's views (ARCHITECTURE.md section 5)
GOLD = "adllabs_096.water_utilities_medallion"  # the attendee's gold layer, read only (section 5.6)

_TTL_S = 300
_POLL_LIMIT_S = 120
_cache: dict[tuple[str, tuple[tuple[str, str | None], ...]], tuple[float, list[dict[str, Any]]]] = {}


def _coerce(value: str | None, type_name: str) -> Any:
    if value is None:
        return None
    if type_name in {"INT", "LONG", "SHORT", "BYTE"}:
        return int(value)
    if type_name in {"DOUBLE", "FLOAT", "DECIMAL"}:
        return float(value)
    if type_name == "BOOLEAN":
        return value == "true"
    return value


def _wait(ws: WorkspaceClient, res: StatementResponse) -> StatementResponse:
    """Polls while a cold warehouse starts; execute_statement waits 50 s at most."""
    started = time.time()
    while res.status and res.status.state in (StatementState.PENDING, StatementState.RUNNING):
        if time.time() - started > _POLL_LIMIT_S:
            raise RuntimeError("SQL warehouse did not answer within 2 minutes")
        time.sleep(1)
        assert res.statement_id
        res = ws.statement_execution.get_statement(res.statement_id)
    return res


def run(ws: WorkspaceClient, sql: str, params: Mapping[str, str | None] | None = None) -> list[dict[str, Any]]:
    key = (sql, tuple(sorted((params or {}).items())))
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < _TTL_S:
        return hit[1]
    res = ws.statement_execution.execute_statement(
        statement=sql,
        warehouse_id=WAREHOUSE_ID,
        wait_timeout="50s",
        disposition=Disposition.INLINE,
        parameters=[StatementParameterListItem(name=k, value=v) for k, v in (params or {}).items()],
    )
    res = _wait(ws, res)
    if res.status is None or res.status.state != StatementState.SUCCEEDED:
        err = res.status.error.message if res.status and res.status.error else "unknown error"
        raise RuntimeError(f"SQL failed: {err}")
    assert res.manifest and res.manifest.schema and res.manifest.schema.columns
    cols = [(c.name or "", c.type_name.value if c.type_name else "STRING") for c in res.manifest.schema.columns]
    data = res.result.data_array if res.result and res.result.data_array else []
    rows = [{name: _coerce(v, t) for (name, t), v in zip(cols, row)} for row in data]
    _cache[key] = (time.time(), rows)
    return rows
