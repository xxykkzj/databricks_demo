import { Suspense, type ReactNode } from "react";
import { QueryErrorResetBoundary } from "@tanstack/react-query";
import { ErrorBoundary } from "react-error-boundary";
import { ChevronRight, Database, RotateCcw } from "lucide-react";

import { ApiError, type QueryOut } from "@/lib/api";
import { EVENT_TYPES, STATUS_META, type EventType, type Status } from "@/lib/desk";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function TypeChip({ type, compact = false }: { type: EventType; compact?: boolean }) {
  const meta = EVENT_TYPES[type];
  const Icon = meta.icon;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-xs font-medium text-foreground">
      <span
        aria-hidden
        className="inline-flex size-5 shrink-0 items-center justify-center rounded-[5px] text-white"
        style={{ background: meta.color }}
      >
        <Icon className="size-3" strokeWidth={2.5} />
      </span>
      {compact ? null : <span className="truncate">{meta.short}</span>}
    </span>
  );
}

export function StatusBadge({ status, suggested = false }: { status: Status; suggested?: boolean }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium",
        suggested ? "border border-dashed" : "border border-transparent",
      )}
      style={{
        color: meta.color,
        borderColor: suggested ? meta.color : undefined,
        background: suggested ? "transparent" : `color-mix(in oklab, ${meta.color} 12%, transparent)`,
      }}
      title={suggested ? `${status}: suggested from the data, not saved yet` : `${status}: saved`}
    >
      <Icon className="size-3.5" strokeWidth={2.25} aria-hidden />
      {status}
      {suggested ? <span className="font-normal opacity-80">· suggested</span> : null}
    </span>
  );
}

export function ShowQuery({ queries, className }: { queries: QueryOut[]; className?: string }) {
  return (
    <details className={cn("group rounded-md border bg-card text-sm", className)}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden />
        <Database className="size-4" aria-hidden />
        Show the {queries.length === 1 ? "query" : `${queries.length} queries`} behind this
      </summary>
      <div className="space-y-3 border-t px-3 py-3">
        {queries.map((q) => (
          <div key={q.label}>
            <p className="mb-1 text-xs font-medium text-muted-foreground">{q.label}</p>
            <pre className="max-h-72 overflow-auto rounded bg-muted p-3 font-mono text-xs leading-relaxed whitespace-pre">
              {q.sql}
            </pre>
          </div>
        ))}
      </div>
    </details>
  );
}

function errorText(error: unknown): string {
  if (error instanceof ApiError) {
    const body = error.body as { detail?: unknown } | string | null;
    const detail = typeof body === "object" && body && "detail" in body ? body.detail : body;
    if (typeof detail === "string" && detail.length < 300) return detail;
    if (error.status >= 500) return "The data service returned an error. Nothing was changed.";
    return `The request failed (HTTP ${error.status}).`;
  }
  return error instanceof Error ? error.message : "Something went wrong.";
}

export function ErrorPanel({ error, onRetry, what }: { error: unknown; onRetry: () => void; what: string }) {
  return (
    <div role="alert" className="rounded-md border border-destructive/50 bg-card p-4 text-sm">
      <p className="font-medium text-destructive">{what} could not be loaded.</p>
      <p className="mt-1 text-muted-foreground">{errorText(error)}</p>
      <Button size="sm" variant="outline" className="mt-3" onClick={onRetry}>
        <RotateCcw className="size-3.5" aria-hidden /> Try again
      </Button>
    </div>
  );
}

/** Suspense plus an error boundary with retry: every data panel uses this. */
export function QueryBoundary({
  children,
  fallback,
  what,
  resetKeys,
}: {
  children: ReactNode;
  fallback?: ReactNode;
  what: string;
  resetKeys?: unknown[];
}) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ErrorBoundary
          onReset={reset}
          resetKeys={resetKeys}
          fallbackRender={({ error, resetErrorBoundary }) => (
            <ErrorPanel error={error} onRetry={resetErrorBoundary} what={what} />
          )}
        >
          <Suspense fallback={fallback ?? <PanelSkeleton />}>{children}</Suspense>
        </ErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}

export function PanelSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading" className="space-y-2">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 className="text-[15px] font-semibold text-foreground">{children}</h2>
      {aside ? <div className="text-xs text-muted-foreground">{aside}</div> : null}
    </div>
  );
}
