import { useMemo, useRef } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { FileCheck2, FileWarning, Search, X } from "lucide-react";

import { useListEventsSuspense, type EventOut, type EventsOut } from "@/lib/api";
import selector from "@/lib/selector";
import {
  EVENT_TYPES,
  STATUSES,
  STATUS_META,
  TYPE_ORDER,
  eventKey,
  fmtDate,
  fmtImpact,
  fmtReports,
  shortTitle,
  type EventType,
  type Status,
} from "@/lib/desk";
import { PanelSkeleton, QueryBoundary, ShowQuery, StatusBadge, TypeChip } from "@/components/desk/bits";
import { EventDetail } from "@/components/desk/event-detail";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type StatusFilter = "any" | "not_closed" | Status;
type Sort = "attention" | "newest";
type RegisterSearch = {
  type?: EventType;
  status?: StatusFilter;
  due?: boolean;
  q?: string;
  sort?: Sort;
  t?: EventType;
  id?: string;
};

const isType = (v: unknown): v is EventType => typeof v === "string" && v in EVENT_TYPES;
const STATUS_FILTERS: StatusFilter[] = ["any", "not_closed", ...STATUSES];

export const Route = createFileRoute("/events")({
  validateSearch: (s: Record<string, unknown>): RegisterSearch => ({
    type: isType(s.type) ? s.type : undefined,
    status: STATUS_FILTERS.includes(s.status as StatusFilter) && s.status !== "any" ? (s.status as StatusFilter) : undefined,
    due: s.due === true || s.due === "true" ? true : undefined,
    q: typeof s.q === "string" && s.q ? s.q : undefined,
    sort: s.sort === "newest" ? "newest" : undefined,
    t: isType(s.t) ? s.t : undefined,
    id: typeof s.id === "string" && s.id ? s.id : undefined,
  }),
  component: () => (
    <QueryBoundary what="The register" fallback={<PanelSkeleton rows={10} />}>
      <Register />
    </QueryBoundary>
  ),
});

function matches(e: EventOut, search: RegisterSearch): boolean {
  if (search.type && e.event_type !== search.type) return false;
  if (search.status === "not_closed" && e.status === "Closed") return false;
  if (search.status && search.status !== "not_closed" && search.status !== "any" && e.status !== search.status) return false;
  if (search.due && (e.docs_expected === 0 || e.report_on_file)) return false;
  if (search.q) {
    const q = search.q.toLowerCase();
    const hay = `${e.title} ${e.event_id} ${e.region_name ?? ""} ${e.dma_name ?? ""} ${e.plant_name ?? ""} ${e.owner ?? ""}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function Register() {
  const { data } = useListEventsSuspense(selector<EventsOut>());
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const list = useRef<HTMLUListElement>(null);

  const set = (patch: Partial<RegisterSearch>) =>
    navigate({ search: (prev: RegisterSearch) => ({ ...prev, ...patch }), replace: true });

  const rows = useMemo(() => {
    const shown = data.events.filter((e) => matches(e, search));
    return shown.sort((a, b) =>
      search.sort === "newest"
        ? b.event_date.localeCompare(a.event_date)
        : STATUS_META[a.status].rank - STATUS_META[b.status].rank || b.event_date.localeCompare(a.event_date),
    );
  }, [data.events, search]);

  const selected = search.t && search.id ? data.events.find((e) => e.event_type === search.t && e.event_id === search.id) : undefined;
  const filtered = Boolean(search.type || search.status || search.due || search.q);

  function select(e: EventOut) {
    set({ t: e.event_type, id: e.event_id });
  }

  function onListKey(event: React.KeyboardEvent<HTMLUListElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const items = Array.from(list.current?.querySelectorAll<HTMLLIElement>("[role=option]") ?? []);
    const index = items.findIndex((el) => el === document.activeElement);
    const next = items[Math.min(Math.max(index + (event.key === "ArrowDown" ? 1 : -1), 0), items.length - 1)];
    next?.focus();
    const row = rows[items.indexOf(next)];
    if (row) select(row);
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      <section aria-label="Register" className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold">Register</h1>
            <p className="text-sm text-muted-foreground">
              Major events to {fmtDate(data.data_to)}. Open first, then newest. Select one to act on it.
            </p>
          </div>
          <p className="text-xs text-muted-foreground tabular" aria-live="polite">
            {rows.length} of {data.events.length} shown
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={search.type ?? "all"} onValueChange={(v) => set({ type: v === "all" ? undefined : (v as EventType) })}>
            <SelectTrigger aria-label="Event type" className="h-8 w-[10.75rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All event types</SelectItem>
              {TYPE_ORDER.map((t) => (
                <SelectItem key={t} value={t}>{EVENT_TYPES[t].plural}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={search.status ?? "any"} onValueChange={(v) => set({ status: v === "any" ? undefined : (v as StatusFilter) })}>
            <SelectTrigger aria-label="Status" className="h-8 w-[8.75rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any status</SelectItem>
              <SelectItem value="not_closed">Not closed</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant={search.due ? "secondary" : "outline"}
            size="sm"
            aria-pressed={Boolean(search.due)}
            onClick={() => set({ due: search.due ? undefined : true })}
          >
            <FileWarning className="size-3.5" aria-hidden /> Report due
          </Button>
          <Select value={search.sort ?? "attention"} onValueChange={(v) => set({ sort: v === "newest" ? "newest" : undefined })}>
            <SelectTrigger aria-label="Sort" className="h-8 w-[8.5rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="attention">Open first</SelectItem>
              <SelectItem value="newest">Newest first</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative min-w-[9rem] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              aria-label="Search events"
              placeholder="Search DMA, plant, ID, owner"
              defaultValue={search.q ?? ""}
              onChange={(e) => set({ q: e.target.value || undefined })}
              className="h-8 pl-8"
            />
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-md border bg-card p-6 text-sm">
            <p className="font-medium">No events match these filters.</p>
            <p className="mt-1 text-muted-foreground">Widen the status or type, or clear the search to see all {data.events.length} events.</p>
            {filtered ? (
              <Button size="sm" variant="outline" className="mt-3" onClick={() => set({ type: undefined, status: undefined, due: undefined, q: undefined })}>
                <X className="size-3.5" aria-hidden /> Clear filters
              </Button>
            ) : null}
          </div>
        ) : (
          <ul
            ref={list}
            role="listbox"
            aria-label="Major events"
            onKeyDown={onListKey}
            className="divide-y overflow-hidden rounded-md border bg-card"
          >
            {rows.map((e) => {
              const isSelected = selected !== undefined && eventKey(selected) === eventKey(e);
              return (
                <li
                  key={eventKey(e)}
                  role="option"
                  aria-selected={isSelected}
                  tabIndex={isSelected || (!selected && rows[0] === e) ? 0 : -1}
                  onClick={() => select(e)}
                  onKeyDown={(k) => {
                    if (k.key === "Enter" || k.key === " ") {
                      k.preventDefault();
                      select(e);
                    }
                  }}
                  className={cn(
                    "grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 px-3 py-2.5 outline-none hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                    "md:grid-cols-[5.5rem_minmax(0,1fr)_7rem_4rem_8.25rem] md:items-center",
                    isSelected && "bg-accent",
                  )}
                >
                  <span className="order-2 text-xs text-muted-foreground tabular md:order-none">{fmtDate(e.event_date)}</span>
                  <span className="order-1 min-w-0 md:order-none">
                    <span className="flex min-w-0 items-center gap-2">
                      <TypeChip type={e.event_type} compact />
                      <span className={cn("truncate", isSelected ? "font-semibold" : "font-medium")} title={e.title}>
                        {shortTitle(e)}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate pl-7 text-xs text-muted-foreground" title={e.suggested_reason}>
                      {e.status_source === "saved"
                        ? `${e.owner ? `${e.owner} · ` : ""}${e.note ?? "Status saved"}`
                        : e.suggested_reason}
                    </span>
                  </span>
                  <span className="hidden truncate text-xs text-muted-foreground md:block" title={e.region_name ?? ""}>
                    {e.region_name}
                    <span className="block tabular">{fmtImpact(e)}</span>
                  </span>
                  <span className="hidden items-center gap-1 text-xs tabular md:flex" title="Reports or notices on file">
                    {e.docs_expected === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : e.report_on_file ? (
                      <><FileCheck2 className="size-3.5 text-success" aria-hidden />{fmtReports(e)}</>
                    ) : (
                      <><FileWarning className="size-3.5 text-status-open" aria-hidden />{fmtReports(e)}</>
                    )}
                  </span>
                  <span className="order-3 justify-self-start md:order-none md:justify-self-end">
                    <StatusBadge status={e.status} suggested={e.status_source === "suggested"} />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">* Leak loss is an estimate: inflow × NRW points above the peer median.</p>
        <ShowQuery queries={[data.query]} />
      </section>

      <aside aria-label="Selected event" className="min-w-0 lg:sticky lg:top-[4.5rem] lg:max-h-[calc(100vh-5.5rem)] lg:overflow-y-auto lg:pr-1">
        {selected ? (
          <QueryBoundary what="This event" resetKeys={[eventKey(selected)]} fallback={<PanelSkeleton rows={6} />}>
            <EventDetail eventType={selected.event_type} eventId={selected.event_id} />
          </QueryBoundary>
        ) : (
          <div className="rounded-md border border-dashed bg-card p-6 text-sm">
            <p className="font-medium">Choose an event to work on.</p>
            <p className="mt-1 text-muted-foreground">
              Its facts, the report PDF, its history and the status form open here. Use the arrow keys to move through the
              list.
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}
