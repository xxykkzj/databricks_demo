from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Any, cast

from fastapi import HTTPException, Query, Response

from . import queries as q
from .core import Dependencies, create_router
from .documents import ROOT, is_listed, list_pdfs, read_pdf
from .models import (
    DashboardOut,
    DocumentOut,
    DocumentsOut,
    EventDetailOut,
    EventItem,
    EventOut,
    EventsOut,
    EventType,
    Fact,
    HistoryOut,
    MetaOut,
    QueryOut,
    RegionOut,
    Status,
    SeriesOut,
    SeriesPoint,
    StatusIn,
    TileOut,
    TrendPoint,
    VersionOut,
)
from .sql import run
from .store import SavedStatus, StatusChange, StatusConflict, StoreDependency

router = create_router()

LABELS: dict[EventType, str] = {
    "major_break": "Major main breaks",
    "overflow_storm": "Storm overflow events",
    "low_chlorine": "Low-chlorine cases",
    "leak_alert": "Leak alerts",
}
FACT_QUERIES: dict[EventType, tuple[str, str]] = {
    "major_break": ("Break, main and pipe risk", q.BREAK_FACTS),
    "overflow_storm": ("Storm summary", q.STORM_FACTS),
    "low_chlorine": ("Chlorine case", q.CHLORINE_FACTS),
    "leak_alert": ("Leak alert: gold_dma_nrw_daily", q.LEAK_FACTS),
}
REGISTER_QUERY = QueryOut(label="Register: adllabs_096.default.incident_events", sql=q.EVENTS)


# --- helpers ---


def _window(ws) -> tuple[str, str]:
    row = run(ws, q.DATA_WINDOW)[0]
    return row["data_from"], row["data_to"]


def _event(row: dict[str, Any], saved: SavedStatus | None) -> EventOut:
    return EventOut(
        **row,
        status=cast(Status, saved.status if saved else row["suggested_status"]),
        status_source="saved" if saved else "suggested",
        owner=saved.owner if saved else None,
        note=saved.note if saved else None,
        regulator_notified_on=saved.regulator_notified_on.isoformat()
        if saved and saved.regulator_notified_on
        else None,
        updated_by=saved.updated_by if saved else None,
        updated_at=saved.updated_at.isoformat() if saved else None,
        version=saved.version if saved else 0,
    )


def _find_row(ws, event_type: str, event_id: str) -> dict[str, Any]:
    for row in run(ws, q.EVENTS):
        if row["event_type"] == event_type and row["event_id"] == event_id:
            return row
    raise HTTPException(status_code=404, detail="No such event in the register")


def _merged(ws, store) -> list[EventOut]:
    saved = store.all()
    return [_event(r, saved.get((r["event_type"], r["event_id"]))) for r in run(ws, q.EVENTS)]


def _day(value: str | None) -> str:
    return datetime.strptime(value, "%Y-%m-%d").strftime("%-d %b %Y") if value else "—"


def _yes(value: bool | None) -> str:
    return "—" if value is None else ("Yes" if value else "No")


def _risk(r: dict[str, Any]) -> str:
    if not r.get("risk_tier"):
        return "Not scored"
    top = max(1, round(100 * float(r["risk_pct_rank"] or 0)))  # gold ranks 0 = riskiest main
    return f"{r['risk_tier']} (counts this break): top {top}% of mains by break likelihood; {r['breaks_total']} breaks on this main"


def _items(rows: list[dict[str, Any]]) -> list[EventItem]:
    return [
        EventItem(
            item_id=r["overflow_id"],
            title=f"{r['sewer_main_id']} · {r['volume_kl']:,.0f} kL to {r['receiving_water']}",
            detail=f"{r['duration_hours']:.1f} h · {str(r['material']).capitalize()}, laid {r['install_year']}"
            + (" · inflow defect" if r["has_ii_defect"] else ""),
            doc_id=r["doc_id"],
            doc_path=r["doc_path"],
        )
        for r in rows
    ]


def _facts(event_type: EventType, r: dict[str, Any]) -> list[Fact]:
    if event_type == "major_break":
        pairs = [
            ("Failure", str(r["failure_type"]).capitalize()),
            ("Pipe", f"{r['pipe_material']}, {r['diameter_mm']} mm, laid {r['install_year']}"),
            ("Length and cover", f"{r['length_m']:,.0f} m at {r['depth_m']:.1f} m deep"),
            ("Soil", r["soil_type"]),
            ("Hot dry day", _yes(r["hot_dry_day"])),
            ("Probable cause", r["probable_cause"]),
            ("Customers affected", f"{r['customers_affected']:,}"),
            ("Repair time", f"{r['repair_hours']:.1f} hours"),
            ("Repair cost", f"A${r['repair_cost_aud']:,.0f}"),
            ("Work order", r["work_order_id"]),
            ("Trunk main", _yes(r["is_trunk"])),
            ("Pipe risk (gold)", _risk(r)),
        ]
    elif event_type == "overflow_storm":
        pairs = [
            ("Major overflows", f"{r['overflows']}"),
            ("Reports on file", f"{r['reports']} of {r['overflows']}"),
            ("Volume spilled", f"{r['volume_kl']:,.0f} kL"),
            ("Rainfall that day", f"{r['rainfall_mm']:.1f} mm"),
            ("Longest overflow", f"{r['longest_hours']:.1f} hours"),
            ("Pre-1975 mains with inflow defects", f"{r['old_defective_mains']} of {r['overflows']}"),
            ("Receiving water", r["receiving_waters"]),
        ]
    elif event_type == "leak_alert":
        ratio = r["mnf_vs_peer_now"]
        pairs = [
            ("Alert days", f"{r['alert_days']}"),
            ("Last alert day", _day(r["last_alert_day"])),
            ("Night flow at start → now", f"{r['mnf_at_start']:.2f} → {r['mnf_now']:.2f} kL/h"),
            ("Night flow vs peer DMAs", f"{ratio:.1f}× (14-day)" if ratio is not None else "—"),
            ("NRW, 28-day average", f"{r['nrw_28d_now']:.1f}% (peer median {r['peer_nrw_now']:.1f}%)"),
            ("Alert rule", "gold_dma_nrw_daily.leak_alert (owned by the gold layer)"),
        ]
    else:
        season = str(r["season"]).capitalize()
        pairs = [
            ("Season", season + (" (partial: data starts 1 Jan 2025)" if r["season_partial"] else "")),
            ("Case opened", _day(r["opened_on"])),
            ("Samples below 0.5 mg/L", f"{r['samples_below']} of {r['season_samples']} in the season"),
            ("Lowest free chlorine", f"{r['min_chlorine_mg_l']:.2f} mg/L"),
            ("Distance from plant", f"{r['distance_from_plant_km']:.1f} km"),
            ("Closure test met", _day(r["closure_test_met_on"]) if r["closure_test_met_on"] else "Not yet"),
            ("Notice issued", _day(r["notice_published_on"]) if r["notice_published_on"] else "No notice on file"),
        ]
    return [Fact(label=label, value=str(value) if value is not None else "—") for label, value in pairs]


def _months(first: str, last: str) -> list[str]:
    y, m = int(first[:4]), int(first[5:7])
    out: list[str] = []
    while f"{y:04d}-{m:02d}" <= last[:7]:
        out.append(f"{y:04d}-{m:02d}")
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


# --- routes ---


@router.get("/version", response_model=VersionOut, operation_id="version")
async def version():
    return VersionOut.from_metadata()


@router.get("/meta", response_model=MetaOut, operation_id="getMeta")
def get_meta(ws: Dependencies.Client, store: StoreDependency):
    data_from, data_to = _window(ws)
    return MetaOut(data_from=data_from, data_to=data_to, status_saving=store.enabled, status_note=store.error)


@router.get("/dashboard", response_model=DashboardOut, operation_id="getDashboard")
def get_dashboard(ws: Dependencies.Client, store: StoreDependency):
    data_from, data_to = _window(ws)
    events = _merged(ws, store)
    cutoff = (date.fromisoformat(data_to) - timedelta(days=30)).isoformat()

    tiles = []
    for event_type, label in LABELS.items():
        of_type = [e for e in events if e.event_type == event_type]
        tiles.append(
            TileOut(
                event_type=event_type,
                label=label,
                total=len(of_type),
                open=sum(e.status != "Closed" for e in of_type),
                missing_report=sum(e.docs_expected > 0 and not e.report_on_file and e.status != "Closed" for e in of_type),
                last_30d=sum(e.event_date > cutoff for e in of_type),
            )
        )

    by_month = Counter((e.event_date[:7], e.event_type) for e in events)
    trend = [
        TrendPoint(
            month=month,
            major_break=by_month[(month, "major_break")],
            overflow_storm=by_month[(month, "overflow_storm")],
            low_chlorine=by_month[(month, "low_chlorine")],
            leak_alert=by_month[(month, "leak_alert")],
        )
        for month in _months(data_from, data_to)
    ]

    open_counts: dict[str, Counter[str]] = defaultdict(Counter)
    for e in events:
        if e.status != "Closed":
            open_counts[e.region_name or "Unknown"][e.event_type] += 1
    open_by_region = sorted(
        (
            RegionOut(
                region_name=region,
                major_break=c["major_break"],
                overflow_storm=c["overflow_storm"],
                low_chlorine=c["low_chlorine"],
                leak_alert=c["leak_alert"],
            )
            for region, c in open_counts.items()
        ),
        key=lambda r: -(r.major_break + r.overflow_storm + r.low_chlorine + r.leak_alert),
    )
    return DashboardOut(
        data_from=data_from,
        data_to=data_to,
        tiles=tiles,
        trend=trend,
        open_by_region=open_by_region,
        status_saving=store.enabled,
        queries=[REGISTER_QUERY, QueryOut(label="Data window: dma_flow_daily", sql=q.DATA_WINDOW)],
    )


@router.get("/events", response_model=EventsOut, operation_id="listEvents")
def list_events(ws: Dependencies.Client, store: StoreDependency):
    _, data_to = _window(ws)
    return EventsOut(events=_merged(ws, store), data_to=data_to, status_saving=store.enabled, query=REGISTER_QUERY)


@router.get("/events/{event_type}/{event_id}", response_model=EventDetailOut, operation_id="getEvent")
def get_event(event_type: EventType, event_id: str, ws: Dependencies.Client, store: StoreDependency):
    row = _find_row(ws, event_type, event_id)
    label, facts_sql = FACT_QUERIES[event_type]
    fact_rows = run(ws, facts_sql, {"event_id": event_id})
    if event_type == "leak_alert" and fact_rows and fact_rows[0]["alert_days"] is None:
        fact_rows = []
    queries = [QueryOut(label=label, sql=facts_sql)]
    params = {"event_id": event_id}
    series: SeriesOut | None = None
    items: list[EventItem] = []
    if event_type == "low_chlorine":
        series = SeriesOut(
            label="Free chlorine at the DMA sample point",
            unit="mg/L",
            value_label="Weekly sample",
            reference_label=None,
            target=0.5,
            target_label="0.5 mg/L target",
            marker_day=row["event_date"],
            marker_label="Case opened",
            points=[SeriesPoint(**r) for r in run(ws, q.CHLORINE_SERIES, params)],
        )
        queries.append(QueryOut(label="Weekly chlorine samples", sql=q.CHLORINE_SERIES))
    elif event_type == "leak_alert":
        series = SeriesOut(
            label="Non-revenue water, weekly average",
            unit="%",
            value_label=row["dma_name"] or "This DMA",
            reference_label="Peer median",
            target=None,
            target_label=None,
            marker_day=row["event_date"],
            marker_label="Alert started",
            points=[SeriesPoint(**r) for r in run(ws, q.LEAK_SERIES, params)],
        )
        queries.append(QueryOut(label="Weekly NRW vs peers: gold_dma_nrw_daily", sql=q.LEAK_SERIES))
    elif event_type == "overflow_storm":
        items = _items(run(ws, q.STORM_ITEMS, params))
        queries.append(QueryOut(label="Overflows in this storm", sql=q.STORM_ITEMS))
    history = [
        HistoryOut(
            from_status=h["from_status"],
            to_status=h["to_status"],
            owner=h["owner"],
            note=h["note"],
            regulator_notified_on=h["regulator_notified_on"].isoformat() if h["regulator_notified_on"] else None,
            accepted_suggestion=h["accepted_suggestion"],
            changed_by=h["changed_by"],
            changed_at=h["changed_at"].astimezone(timezone.utc).isoformat(),
        )
        for h in store.history(event_type, event_id)
    ]
    return EventDetailOut(
        event=_event(row, store.get(event_type, event_id)),
        facts=_facts(event_type, fact_rows[0]) if fact_rows else [],
        series=series,
        items=items,
        history=history,
        status_saving=store.enabled,
        status_note=store.error,
        queries=queries,
    )


@router.put("/events/{event_type}/{event_id}/status", response_model=EventOut, operation_id="updateEventStatus")
def update_event_status(
    event_type: EventType,
    event_id: str,
    body: StatusIn,
    ws: Dependencies.Client,
    store: StoreDependency,
    headers: Dependencies.Headers,
):
    if not store.enabled:
        raise HTTPException(status_code=503, detail=store.error or "Status saving is not available yet.")
    row = _find_row(ws, event_type, event_id)
    saved = store.get(event_type, event_id)
    change = StatusChange(
        event_type=event_type,
        event_id=event_id,
        status=body.status,
        owner=(body.owner or "").strip() or None,
        note=(body.note or "").strip() or None,
        regulator=row["regulator"],
        regulator_notified_on=body.regulator_notified_on,
        accepted_suggestion=body.accepted_suggestion,
        expected_version=body.expected_version,
        request_id=body.request_id,
        from_status=saved.status if saved else row["suggested_status"],
        user=headers.user_email or headers.user_name or "local developer",
    )
    try:
        store.save(change)
    except StatusConflict:
        raise HTTPException(status_code=409, detail="Someone else updated this event. Reload to see their change.")
    return _event(row, store.get(event_type, event_id))


@router.get("/documents", response_model=DocumentsOut, operation_id="listDocuments")
def list_documents(ws: Dependencies.Client):
    index = {r["doc_path"]: r for r in run(ws, q.DOCUMENTS)}
    documents = []
    for f in list_pdfs(ws):
        r = index.get(f.path)
        documents.append(
            DocumentOut(
                path=f.path,
                folder=f.folder,
                file_name=f.file_name,
                size_bytes=f.size_bytes,
                last_modified=datetime.fromtimestamp(f.last_modified_ms / 1000, timezone.utc).isoformat()
                if f.last_modified_ms
                else None,
                indexed=r is not None,
                doc_id=r["doc_id"] if r else None,
                doc_type=r["doc_type"] if r else None,
                title=r["title"] if r else None,
                published_on=r["published_on"] if r else None,
                event_type=r["event_type"] if r else None,
                event_id=r["event_id"] if r else None,
            )
        )
    return DocumentsOut(
        root=ROOT,
        documents=documents,
        query=QueryOut(label="Document index: adllabs_096.default.incident_documents", sql=q.DOCUMENTS),
    )


@router.get("/documents/pdf", operation_id="getDocumentPdf", response_class=Response, include_in_schema=False)
def get_document_pdf(ws: Dependencies.Client, path: str = Query(min_length=1, max_length=400)):
    if not is_listed(ws, path):
        raise HTTPException(status_code=404, detail="No such PDF in the raw volume")
    return Response(
        content=read_pdf(ws, path),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{path.rsplit("/", 1)[-1]}"',
            "Cache-Control": "private, max-age=300",
            "X-Content-Type-Options": "nosniff",
        },
    )
