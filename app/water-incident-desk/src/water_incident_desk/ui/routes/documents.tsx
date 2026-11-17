import { useMemo } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, FileQuestion, FileText, Search } from "lucide-react";

import { useListDocumentsSuspense, type DocumentOut, type DocumentsOut } from "@/lib/api";
import selector from "@/lib/selector";
import { EVENT_TYPES, fmtDate, fmtDateTime, fmtNumber } from "@/lib/desk";
import { PanelSkeleton, QueryBoundary, ShowQuery, TypeChip } from "@/components/desk/bits";
import { PdfViewer } from "@/components/desk/pdf-viewer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type DocsSearch = { folder?: string; unindexed?: boolean; q?: string; path?: string };

const FOLDER_LABELS: Record<string, string> = {
  "documents/incident_report": "Incident reports",
  "documents/sewer_overflow_report": "Sewer overflow reports",
  "documents/water_quality_notice": "Water quality notices",
  "documents/pumping_memo": "Pumping memos",
  "documents/guide": "Data guide",
};
const folderLabel = (f: string) => FOLDER_LABELS[f] ?? f;

export const Route = createFileRoute("/documents")({
  validateSearch: (s: Record<string, unknown>): DocsSearch => ({
    folder: typeof s.folder === "string" && s.folder ? s.folder : undefined,
    unindexed: s.unindexed === true || s.unindexed === "true" ? true : undefined,
    q: typeof s.q === "string" && s.q ? s.q : undefined,
    path: typeof s.path === "string" && s.path ? s.path : undefined,
  }),
  component: () => (
    <QueryBoundary what="The document library" fallback={<PanelSkeleton rows={10} />}>
      <Documents />
    </QueryBoundary>
  ),
});

function Documents() {
  const { data } = useListDocumentsSuspense(selector<DocumentsOut>());
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const set = (patch: Partial<DocsSearch>) => navigate({ search: (prev: DocsSearch) => ({ ...prev, ...patch }), replace: true });

  const folders = useMemo(() => Array.from(new Set(data.documents.map((d) => d.folder))).sort(), [data.documents]);
  const unindexed = data.documents.filter((d) => !d.indexed).length;
  const rows = useMemo(
    () =>
      data.documents.filter((d) => {
        if (search.folder && d.folder !== search.folder) return false;
        if (search.unindexed && d.indexed) return false;
        if (search.q) {
          const hay = `${d.file_name} ${d.title ?? ""} ${d.event_id ?? ""} ${d.doc_id ?? ""}`.toLowerCase();
          if (!hay.includes(search.q.toLowerCase())) return false;
        }
        return true;
      }),
    [data.documents, search],
  );
  const selected: DocumentOut | undefined = data.documents.find((d) => d.path === search.path);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <section aria-label="Documents" className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold">Documents</h1>
            <p className="text-sm text-muted-foreground">
              Every PDF in <code className="font-mono text-xs">{data.root}</code>, read live from the volume.{" "}
              {unindexed === 0 ? "All are indexed." : `${unindexed} not indexed yet.`}
            </p>
          </div>
          <p className="text-xs text-muted-foreground tabular" aria-live="polite">
            {rows.length} of {data.documents.length} shown
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={search.folder ?? "all"} onValueChange={(v) => set({ folder: v === "all" ? undefined : v })}>
            <SelectTrigger aria-label="Folder" className="h-8 w-[13rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All folders</SelectItem>
              {folders.map((f) => (
                <SelectItem key={f} value={f}>{folderLabel(f)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant={search.unindexed ? "secondary" : "outline"} size="sm" aria-pressed={Boolean(search.unindexed)} onClick={() => set({ unindexed: search.unindexed ? undefined : true })}>
            <FileQuestion className="size-3.5" aria-hidden /> Not indexed ({unindexed})
          </Button>
          <div className="relative min-w-[10rem] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input aria-label="Search documents" placeholder="Search file, title or event" defaultValue={search.q ?? ""} onChange={(e) => set({ q: e.target.value || undefined })} className="h-8 pl-8" />
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-md border bg-card p-6 text-sm">
            <p className="font-medium">{search.unindexed ? "Every PDF in the volume is indexed." : "No documents match."}</p>
            <p className="mt-1 text-muted-foreground">
              {search.unindexed
                ? "When a new PDF lands in the raw volume without a documents row, it shows up here within a minute."
                : "Clear the search or choose another folder."}
            </p>
          </div>
        ) : (
          <ul className="divide-y overflow-hidden rounded-md border bg-card" aria-label="PDF files">
            {rows.map((d) => {
              const isSelected = d.path === search.path;
              return (
                <li key={d.path}>
                  <button
                    type="button"
                    onClick={() => set({ path: d.path })}
                    aria-current={isSelected ? "true" : undefined}
                    className={cn("flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none", isSelected && "bg-accent")}
                  >
                    {d.event_type ? <TypeChip type={d.event_type} compact /> : <FileText className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />}
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate", isSelected ? "font-semibold" : "font-medium")} title={d.title ?? d.file_name}>
                        {d.title ?? d.file_name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {d.file_name} · {folderLabel(d.folder)}
                        {d.indexed ? "" : " · not indexed"}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular">{d.published_on ? fmtDate(d.published_on) : "—"}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <ShowQuery queries={[data.query]} />
      </section>

      <aside aria-label="Selected document" className="min-w-0 space-y-3 lg:sticky lg:top-[4.5rem] lg:max-h-[calc(100vh-5.5rem)] lg:overflow-y-auto">
        {selected ? (
          <>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>{folderLabel(selected.folder)}</span>
              {selected.size_bytes != null ? <span className="tabular">{fmtNumber(Math.round(selected.size_bytes / 1024))} KB</span> : null}
              {selected.last_modified ? <span>Landed {fmtDateTime(selected.last_modified)}</span> : null}
              {!selected.indexed ? <span className="font-medium text-status-open">Not indexed: no row in the documents table</span> : null}
              {selected.event_type && selected.event_id ? (
                <Link
                  to="/events"
                  search={{ t: selected.event_type, id: selected.event_id }}
                  className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-2 hover:underline"
                >
                  Open the {EVENT_TYPES[selected.event_type].label.toLowerCase()} <ArrowRight className="size-3" aria-hidden />
                </Link>
              ) : selected.indexed ? (
                <span>Not linked to a register event</span>
              ) : null}
            </div>
            <PdfViewer key={selected.path} path={selected.path} title={selected.title} />
          </>
        ) : (
          <div className="rounded-md border border-dashed bg-card p-6 text-sm">
            <p className="font-medium">Choose a document to read it here.</p>
            <p className="mt-1 text-muted-foreground">
              Each PDF holds facts that are in no table, such as a beach closure or a booster chlorinator. Linked documents
              open their event in the register.
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}
