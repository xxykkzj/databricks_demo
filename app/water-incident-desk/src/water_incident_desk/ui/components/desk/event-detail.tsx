import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, FileX2, History, Lock } from "lucide-react";

import {
  ApiError,
  getDashboardKey,
  getEventKey,
  listEventsKey,
  useGetEventSuspense,
  useUpdateEventStatus,
  type EventDetailOut,
  type EventOut,
} from "@/lib/api";
import selector from "@/lib/selector";
import { EVENT_TYPES, STATUSES, fmtDate, fmtDateTime, fmtImpact, fmtReports, type Status } from "@/lib/desk";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SeriesChart } from "@/components/desk/charts";
import { PdfViewer } from "@/components/desk/pdf-viewer";
import { SectionTitle, ShowQuery, StatusBadge, TypeChip } from "@/components/desk/bits";
import { cn } from "@/lib/utils";

export function EventDetail({ eventType, eventId }: { eventType: EventOut["event_type"]; eventId: string }) {
  const { data } = useGetEventSuspense({
    params: { event_type: eventType, event_id: eventId },
    ...selector<EventDetailOut>(),
  });
  const { event } = data;
  const [docPath, setDocPath] = useState<string | null>(event.doc_path ?? data.items.find((i) => i.doc_path)?.doc_path ?? null);
  useEffect(() => {
    setDocPath(event.doc_path ?? data.items.find((i) => i.doc_path)?.doc_path ?? null);
  }, [event.event_type, event.event_id, event.doc_path, data.items]);
  const meta = EVENT_TYPES[event.event_type];
  const place = [event.dma_name, event.plant_name, event.region_name].filter(Boolean).join(" · ");

  return (
    <article aria-labelledby="event-title" className="space-y-5">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <TypeChip type={event.event_type} />
          <span className="tabular">{fmtDate(event.event_date)}</span>
          <span className="tabular">{fmtImpact(event)}</span>
          {event.asset_risk_tier ? <span title="Gold's risk tier counts this break itself">Pipe risk: {event.asset_risk_tier} (incl. this break)</span> : null}
        </div>
        <h2 id="event-title" className="text-lg leading-snug font-semibold text-balance" aria-live="polite">
          {event.title}
        </h2>
        {place ? <p className="text-sm text-muted-foreground">{place}</p> : null}
      </header>

      <section aria-label="Status" className="space-y-3 rounded-md border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={event.status} suggested={event.status_source === "suggested"} />
          {event.status_source === "saved" && event.updated_at ? (
            <span className="text-xs text-muted-foreground">
              Saved by {event.updated_by} · {fmtDateTime(event.updated_at)}
            </span>
          ) : null}
        </div>
        {event.status_source === "suggested" ? (
          <p className="text-sm">
            <span className="text-muted-foreground">Why: </span>
            {event.suggested_reason}
          </p>
        ) : event.status !== event.suggested_status ? (
          <p className="text-xs text-muted-foreground">The data alone suggests {event.suggested_status}.</p>
        ) : null}
        <StatusForm event={event} saving={data.status_saving} note={data.status_note} />
      </section>

      {data.facts.length ? (
        <section aria-label="Facts">
          <SectionTitle>What the data says</SectionTitle>
          <dl className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
            {data.facts.map((f) => (
              <div key={f.label} className="contents">
                <dt className="text-muted-foreground">{f.label}</dt>
                <dd className="min-w-0">{f.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {data.series ? (
        <section aria-label="Readings" className="rounded-md border bg-card p-4">
          <SeriesChart series={data.series} />
        </section>
      ) : null}

      {data.items.length ? (
        <section aria-label="Overflows in this storm">
          <SectionTitle aside={`${fmtReports(event)} reports on file`}>Overflows in this storm</SectionTitle>
          <ul className="max-h-72 divide-y overflow-auto rounded-md border bg-card text-sm">
            {data.items.map((item) => (
              <li key={item.item_id} className={cn("flex items-center gap-3 px-3 py-2", item.doc_path === docPath && "bg-accent")}>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium" title={item.title}>{item.title}</p>
                  <p className="text-xs text-muted-foreground">{item.detail}</p>
                </div>
                {item.doc_path ? (
                  <Button
                    size="sm"
                    variant={item.doc_path === docPath ? "secondary" : "outline"}
                    onClick={() => setDocPath(item.doc_path)}
                    aria-pressed={item.doc_path === docPath}
                  >
                    {item.doc_path === docPath ? "Showing report" : "View report"}
                  </Button>
                ) : (
                  <span className="shrink-0 text-xs text-muted-foreground">No report</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-label="Report">
        <SectionTitle>Report on file</SectionTitle>
        {docPath ? (
          <PdfViewer path={docPath} />
        ) : (
          <div className="flex items-start gap-3 rounded-md border border-dashed bg-card p-4 text-sm">
            <FileX2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <p>
              {event.event_type === "leak_alert"
                ? "Leak alerts have no report type in the data yet. Record what the investigation found in the note above."
                : `No ${meta.report} is on file for this event${event.status !== "Closed" ? ", which is why it is still open" : ""}. When the PDF lands in the raw volume and is indexed, it appears here.`}
            </p>
          </div>
        )}
      </section>

      <section aria-label="History">
        <SectionTitle>History</SectionTitle>
        {data.history.length ? (
          <ol className="space-y-2 text-sm">
            {data.history.map((h) => (
              <li key={h.changed_at + h.to_status} className="flex gap-3">
                <History className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0">
                  <p>
                    <span className="font-medium">{h.from_status ?? "—"} → {h.to_status}</span>
                    {h.accepted_suggestion ? <span className="text-muted-foreground"> · accepted the suggestion</span> : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {h.changed_by} · {fmtDateTime(h.changed_at)}
                    {h.owner ? ` · owner ${h.owner}` : ""}
                    {h.regulator_notified_on ? ` · regulator notified ${fmtDate(h.regulator_notified_on)}` : ""}
                  </p>
                  {h.note ? <p className="mt-0.5 break-words">{h.note}</p> : null}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">
            No changes saved yet. The status shown is the one the data suggests.
          </p>
        )}
      </section>

      <ShowQuery queries={data.queries} />
    </article>
  );
}

function StatusForm({ event, saving, note }: { event: EventOut; saving: boolean; note: string | null }) {
  const queryClient = useQueryClient();
  const initial = useMemo(
    () => ({
      status: event.status as Status,
      owner: event.owner ?? "",
      notified: event.regulator_notified_on ?? "",
    }),
    [event.status, event.owner, event.regulator_notified_on],
  );
  const [status, setStatus] = useState<Status>(initial.status);
  const [owner, setOwner] = useState(initial.owner);
  const [notified, setNotified] = useState(initial.notified);
  const [text, setText] = useState("");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [outcome, setOutcome] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setStatus(initial.status);
    setOwner(initial.owner);
    setNotified(initial.notified);
    setText("");
    setOutcome(null);
    setRequestId(crypto.randomUUID());
  }, [event.event_type, event.event_id, initial]);

  const mutation = useUpdateEventStatus({
    mutation: {
      onSuccess: ({ data }) => {
        setOutcome({ ok: true, text: `Saved: ${data.status}, by ${data.updated_by ?? "you"}.` });
        setText("");
        setRequestId(crypto.randomUUID());
        void queryClient.invalidateQueries({ queryKey: listEventsKey() });
        void queryClient.invalidateQueries({ queryKey: getDashboardKey() });
        void queryClient.invalidateQueries({ queryKey: getEventKey({ event_type: event.event_type, event_id: event.event_id }) });
      },
      onError: (error) => {
        const body = error instanceof ApiError ? (error.body as { detail?: string } | null) : null;
        setOutcome({ ok: false, text: body?.detail ?? "Not saved. Check your connection and try again; nothing was changed." });
      },
    },
  });

  const dirty =
    status !== initial.status || owner.trim() !== initial.owner || notified !== initial.notified || text.trim() !== "" || event.status_source === "suggested";
  const locked = !saving;
  const busy = mutation.isPending;

  function save(accepted: boolean) {
    setOutcome(null);
    mutation.mutate({
      params: { event_type: event.event_type, event_id: event.event_id },
      data: {
        status: accepted ? event.suggested_status : status,
        owner: owner.trim() || null,
        note: text.trim() || null,
        regulator_notified_on: notified || null,
        accepted_suggestion: accepted,
        expected_version: event.version,
        request_id: requestId,
      },
    });
  }

  return (
    <form
      className="space-y-3 border-t pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        save(false);
      }}
    >
      {locked ? (
        <p className="flex items-start gap-2 rounded bg-muted px-3 py-2 text-xs text-muted-foreground">
          <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>{note ?? "Status saving is not connected yet."} Nothing can be saved until Lakebase is connected.</span>
        </p>
      ) : null}
      <fieldset disabled={locked || busy} className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="status">Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as Status)} disabled={locked || busy}>
            <SelectTrigger id="status" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="owner">Owner</Label>
          <Input id="owner" value={owner} maxLength={80} placeholder="Who is on it" onChange={(e) => setOwner(e.target.value)} />
        </div>
        {event.regulator ? (
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="notified">{event.regulator} notified on</Label>
            <Input id="notified" type="date" value={notified} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setNotified(e.target.value)} className="sm:w-48" />
            <p className="text-xs text-muted-foreground">Regulator is an assumption about South Australian practice, not data.</p>
          </div>
        ) : null}
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="note">Note for the history</Label>
          <Textarea id="note" value={text} maxLength={2000} rows={2} placeholder="What changed, and why" onChange={(e) => setText(e.target.value)} />
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={locked || busy || !dirty}>
          {busy ? "Saving…" : "Save status"}
        </Button>
        {event.status_source === "suggested" ? (
          <Button type="button" size="sm" variant="outline" disabled={locked || busy} onClick={() => save(true)}>
            <Check className="size-3.5" aria-hidden /> Accept suggestion: {event.suggested_status}
          </Button>
        ) : null}
        {outcome ? (
          <p role="status" className={cn("text-xs", outcome.ok ? "text-success" : "text-destructive")}>
            {outcome.text}
          </p>
        ) : null}
      </div>
    </form>
  );
}
