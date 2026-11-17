import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { useGetDashboardSuspense, type DashboardOut } from "@/lib/api";
import selector from "@/lib/selector";
import { EVENT_TYPES, TYPE_ORDER, fmtDate, fmtNumber } from "@/lib/desk";
import { PanelSkeleton, QueryBoundary, SectionTitle, ShowQuery, TypeChip } from "@/components/desk/bits";
import { Legend, RegionBars, TrendChart } from "@/components/desk/charts";

export const Route = createFileRoute("/")({
  component: () => (
    <QueryBoundary what="The dashboard" fallback={<PanelSkeleton rows={8} />}>
      <Dashboard />
    </QueryBoundary>
  ),
});

function Dashboard() {
  const { data } = useGetDashboardSuspense(selector<DashboardOut>());
  const total = data.tiles.reduce((s, t) => s + t.total, 0);
  const open = data.tiles.reduce((s, t) => s + t.open, 0);
  const due = data.tiles.reduce((s, t) => s + t.missing_report, 0);
  const tile = Object.fromEntries(data.tiles.map((t) => [t.event_type, t]));

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold text-balance">Where things stand</h1>
        <p className="max-w-[75ch] text-sm text-muted-foreground">
          {fmtNumber(open)} of {fmtNumber(total)} major events are open, and {fmtNumber(due)} still need a report or
          notice. Every figure covers {fmtDate(data.data_from)} to {fmtDate(data.data_to)}, the last day of data; “last
          30 days” means up to {fmtDate(data.data_to)}.
        </p>
      </div>

      <section aria-label="Summary by event type" className="overflow-x-auto rounded-md border bg-card">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="px-4 py-2.5 font-medium">Event type</th>
              <th className="px-4 py-2.5 text-right font-medium">Events</th>
              <th className="px-4 py-2.5 text-right font-medium">Open</th>
              <th className="px-4 py-2.5 text-right font-medium">Report or notice due</th>
              <th className="px-4 py-2.5 text-right font-medium">Last 30 days of data</th>
              <th className="px-4 py-2.5"><span className="sr-only">Open in register</span></th>
            </tr>
          </thead>
          <tbody>
            {TYPE_ORDER.map((type) => {
              const t = tile[type];
              if (!t) return null;
              return (
                <tr key={type} className="border-b last:border-b-0 hover:bg-accent/50">
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2">
                      <TypeChip type={type} compact />
                      <span className="font-medium">{EVENT_TYPES[type].plural}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">{fmtNumber(t.total)}</td>
                  <td className="px-4 py-3 text-right font-semibold">{fmtNumber(t.open)}</td>
                  <td className="px-4 py-3 text-right">{type === "leak_alert" ? "—" : fmtNumber(t.missing_report)}</td>
                  <td className="px-4 py-3 text-right">{fmtNumber(t.last_30d)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to="/events"
                      search={{ type, status: "not_closed" }}
                      className="inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap text-foreground underline-offset-2 hover:underline"
                    >
                      Open items <ArrowRight className="size-3" aria-hidden />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <section aria-label="Events per month" className="rounded-md border bg-card p-4">
          <SectionTitle aside="by the month each event started">Major events per month</SectionTitle>
          <TrendChart points={data.trend} dataTo={data.data_to} />
        </section>
        <section aria-label="Open events by region" className="rounded-md border bg-card p-4">
          <SectionTitle aside={`${fmtNumber(open)} open`}>Open events by region</SectionTitle>
          <div className="mb-3">
            <Legend items={TYPE_ORDER.map((t) => ({ key: t, label: EVENT_TYPES[t].short, color: EVENT_TYPES[t].color }))} />
          </div>
          <RegionBars rows={data.open_by_region} />
        </section>
      </div>

      <p className="text-xs text-muted-foreground">
        Open = no status saved as Closed; until someone saves one, each event shows the status its data suggests. Leak-loss
        figures are estimates. Regulators shown are an assumption about South Australian practice.
      </p>
      <ShowQuery queries={data.queries} />
    </div>
  );
}
