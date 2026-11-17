from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from .. import __version__

EventType = Literal["major_break", "overflow_storm", "low_chlorine", "leak_alert"]
Status = Literal["Open", "In review", "Actioned", "Closed"]
STATUSES: tuple[Status, ...] = ("Open", "In review", "Actioned", "Closed")


class VersionOut(BaseModel):
    version: str

    @classmethod
    def from_metadata(cls):
        return cls(version=__version__)


class QueryOut(BaseModel):
    label: str
    sql: str


class MetaOut(BaseModel):
    data_from: str
    data_to: str
    status_saving: bool
    status_note: str | None


class EventOut(BaseModel):
    event_type: EventType
    event_id: str
    event_date: str
    title: str
    region_id: str | None
    region_name: str | None
    dma_id: str | None
    dma_name: str | None
    plant_id: str | None
    plant_name: str | None
    asset_id: str | None
    asset_risk_tier: str | None
    impact_value: float | None
    impact_unit: str | None
    doc_id: str | None
    doc_path: str | None
    docs_on_file: int
    docs_expected: int
    report_on_file: bool
    regulator: str | None
    suggested_status: Status
    suggested_reason: str
    status: Status
    status_source: Literal["saved", "suggested"]
    owner: str | None
    note: str | None
    regulator_notified_on: str | None
    updated_by: str | None
    updated_at: str | None
    version: int


class EventsOut(BaseModel):
    events: list[EventOut]
    data_to: str
    status_saving: bool
    query: QueryOut


class TileOut(BaseModel):
    event_type: EventType
    label: str
    total: int
    open: int
    missing_report: int
    last_30d: int


class TrendPoint(BaseModel):
    month: str
    major_break: int
    overflow_storm: int
    low_chlorine: int
    leak_alert: int


class RegionOut(BaseModel):
    region_name: str
    major_break: int
    overflow_storm: int
    low_chlorine: int
    leak_alert: int


class DashboardOut(BaseModel):
    data_from: str
    data_to: str
    tiles: list[TileOut]
    trend: list[TrendPoint]
    open_by_region: list[RegionOut]
    status_saving: bool
    queries: list[QueryOut]


class Fact(BaseModel):
    label: str
    value: str


class SeriesPoint(BaseModel):
    day: str
    value: float
    reference: float | None


class SeriesOut(BaseModel):
    label: str
    unit: str
    value_label: str
    reference_label: str | None
    target: float | None
    target_label: str | None
    marker_day: str | None
    marker_label: str | None
    points: list[SeriesPoint]


class EventItem(BaseModel):
    item_id: str
    title: str
    detail: str
    doc_id: str | None
    doc_path: str | None


class HistoryOut(BaseModel):
    from_status: str | None
    to_status: str
    owner: str | None
    note: str | None
    regulator_notified_on: str | None
    accepted_suggestion: bool
    changed_by: str
    changed_at: str


class EventDetailOut(BaseModel):
    event: EventOut
    facts: list[Fact]
    series: SeriesOut | None
    items: list[EventItem]
    history: list[HistoryOut]
    status_saving: bool
    status_note: str | None
    queries: list[QueryOut]


class StatusIn(BaseModel):
    status: Status
    owner: str | None = Field(default=None, max_length=80)
    note: str | None = Field(default=None, max_length=2000)
    regulator_notified_on: date | None = None
    accepted_suggestion: bool = False
    expected_version: int = Field(ge=0)
    request_id: UUID


class DocumentOut(BaseModel):
    path: str
    folder: str
    file_name: str
    size_bytes: int | None
    last_modified: str | None
    indexed: bool
    doc_id: str | None
    doc_type: str | None
    title: str | None
    published_on: str | None
    event_type: EventType | None
    event_id: str | None


class DocumentsOut(BaseModel):
    root: str
    documents: list[DocumentOut]
    query: QueryOut
