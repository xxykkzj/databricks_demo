import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { RegionOut, SeriesOut, TrendPoint } from "@/lib/api";
import { EVENT_TYPES, TYPE_ORDER, fmtDate, fmtLongMonth, fmtMonth, fmtNumber, parseDay, type EventType } from "@/lib/desk";
import { cn } from "@/lib/utils";

const GAP = 2; // surface gap between stacked fills
const RADIUS = 4; // rounded data end

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(Number(v.toFixed(6)));
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

/** A path for a bar whose data end (top or right) is rounded and whose baseline end is square. */
function barPath(x: number, y: number, w: number, h: number, end: "top" | "right", round: boolean): string {
  const r = round ? Math.min(RADIUS, end === "top" ? h : w, end === "top" ? w / 2 : h / 2) : 0;
  if (end === "top") {
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  }
  return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
}

function Tooltip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  const left = Math.min(Math.max(x - 90, 0), Math.max(width - 180, 0));
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-10 w-[180px] rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-[0_4px_16px_rgba(11,32,38,0.14)]"
      style={{ left, top: Math.max(y - 8, 0), transform: "translateY(-100%)" }}
    >
      {children}
    </div>
  );
}

function Swatch({ color, dashed = false }: { color: string; dashed?: boolean }) {
  return dashed ? (
    <svg width="14" height="8" aria-hidden className="shrink-0">
      <line x1="0" y1="4" x2="14" y2="4" stroke={color} strokeWidth="2" strokeDasharray="3 2" />
    </svg>
  ) : (
    <span aria-hidden className="inline-block size-2.5 shrink-0 rounded-[3px]" style={{ background: color }} />
  );
}

export function Legend({ items }: { items: { key: string; label: string; color: string; value?: string; dashed?: boolean }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((item) => (
        <li key={item.key} className="inline-flex items-center gap-1.5">
          <Swatch color={item.color} dashed={item.dashed} />
          <span className="text-foreground">{item.label}</span>
          {item.value ? <span className="tabular">{item.value}</span> : null}
        </li>
      ))}
    </ul>
  );
}

function TableToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={open}
      className="rounded px-1.5 py-0.5 text-xs font-medium text-muted-foreground underline-offset-2 hover:bg-accent hover:text-foreground hover:underline"
    >
      {open ? "Show the chart" : "Show the table"}
    </button>
  );
}

// --- Monthly trend: stacked bars by event type --------------------------------

export function TrendChart({ points, dataTo }: { points: TrendPoint[]; dataTo: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const height = 230;
  const m = { top: 12, right: 8, bottom: 26, left: 32 };
  const totals = points.map((p) => TYPE_ORDER.reduce((s, t) => s + p[t], 0));
  const ticks = niceTicks(Math.max(...totals, 1));
  const yMax = ticks[ticks.length - 1];
  const plotW = Math.max(width - m.left - m.right, 0);
  const plotH = height - m.top - m.bottom;
  const band = points.length ? plotW / points.length : 0;
  const barW = Math.max(Math.min(band * 0.68, 28), 2);
  const y = (v: number) => m.top + plotH - (v / yMax) * plotH;
  const labelEvery = band >= 38 ? 1 : band >= 19 ? 2 : 3;
  const typeTotals = Object.fromEntries(TYPE_ORDER.map((t) => [t, points.reduce((s, p) => s + p[t], 0)])) as Record<EventType, number>;
  const partial = dataTo.slice(8, 10) !== "31" && dataTo.slice(8, 10) !== "30";

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <Legend
          items={TYPE_ORDER.map((t) => ({
            key: t,
            label: EVENT_TYPES[t].plural,
            color: EVENT_TYPES[t].color,
            value: fmtNumber(typeTotals[t]),
          }))}
        />
        <TableToggle open={table} onToggle={() => setTable((v) => !v)} />
      </div>
      {table ? (
        <div className="max-h-[260px] overflow-auto rounded border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium">Month</th>
                {TYPE_ORDER.map((t) => (
                  <th key={t} className="px-2 py-1.5 text-right font-medium">{EVENT_TYPES[t].short}</th>
                ))}
                <th className="px-2 py-1.5 text-right font-medium">All</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p, i) => (
                <tr key={p.month} className="border-t">
                  <td className="px-2 py-1">{fmtLongMonth(p.month)}</td>
                  {TYPE_ORDER.map((t) => (
                    <td key={t} className="px-2 py-1 text-right">{p[t]}</td>
                  ))}
                  <td className="px-2 py-1 text-right font-medium">{totals[i]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={ref} className="relative" onMouseLeave={() => setHover(null)}>
          {width > 0 ? (
            <svg
              width={width}
              height={height}
              role="img"
              aria-label={`Major events per month by type, ${fmtMonth(points[0]?.month ?? "")} to ${fmtMonth(points.at(-1)?.month ?? "")}. Use “Show the table” for the numbers.`}
            >
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={m.left} x2={width - m.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--chart-axis)" : "var(--chart-grid)"} />
                  <text x={m.left - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize="11" fill="var(--chart-muted)" className="tabular">
                    {t}
                  </text>
                </g>
              ))}
              {points.map((p, i) => {
                const x = m.left + i * band + (band - barW) / 2;
                let acc = 0;
                const present = TYPE_ORDER.filter((t) => p[t] > 0);
                return (
                  <g key={p.month} opacity={hover === null || hover === i ? 1 : 0.45}>
                    {present.map((t, k) => {
                      const y0 = y(acc);
                      acc += p[t];
                      const y1 = y(acc);
                      const top = k === present.length - 1;
                      const h = Math.max(y0 - y1 - (k > 0 ? GAP : 0), 1);
                      return <path key={t} d={barPath(x, y1, barW, h, "top", top)} fill={EVENT_TYPES[t].color} />;
                    })}
                    <rect
                      x={m.left + i * band}
                      y={m.top}
                      width={band}
                      height={plotH}
                      fill="transparent"
                      onMouseEnter={() => setHover(i)}
                    />
                    {i % labelEvery === 0 ? (
                      <text x={x + barW / 2} y={height - 8} textAnchor="middle" fontSize="11" fill="var(--chart-muted)">
                        {fmtMonth(p.month)}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </svg>
          ) : (
            <div style={{ height }} />
          )}
          {hover !== null && points[hover] ? (
            <Tooltip x={m.left + hover * band + band / 2} y={y(totals[hover])} width={width}>
              <p className="mb-1 font-medium">
                {fmtLongMonth(points[hover].month)}
                {hover === points.length - 1 && partial ? ` (to ${fmtDate(dataTo)})` : ""}
              </p>
              {TYPE_ORDER.map((t) => (
                <p key={t} className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5"><Swatch color={EVENT_TYPES[t].color} />{EVENT_TYPES[t].short}</span>
                  <span className="tabular">{points[hover][t]}</span>
                </p>
              ))}
              <p className="mt-1 flex justify-between border-t pt-1 font-medium"><span>All</span><span className="tabular">{totals[hover]}</span></p>
            </Tooltip>
          ) : null}
        </div>
      )}
    </div>
  );
}

// --- Open events by region: horizontal stacked bars ----------------------------

export function RegionBars({ rows }: { rows: RegionOut[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const totals = rows.map((r) => TYPE_ORDER.reduce((s, t) => s + r[t], 0));
  const max = Math.max(...totals, 1);
  const rowH = 30;
  const labelW = Math.min(190, Math.max(width * 0.42, 110));
  const valueW = 34;
  const trackW = Math.max(width - labelW - valueW, 0);

  if (rows.length === 0) {
    return <p className="rounded border p-4 text-sm text-muted-foreground">No open events in any region. Every event is closed.</p>;
  }
  return (
    <div ref={ref} className="relative" onMouseLeave={() => setHover(null)}>
      {width > 0 ? (
        <svg width={width} height={rows.length * rowH} role="img" aria-label="Open events by service region and type">
          {rows.map((r, i) => {
            const cy = i * rowH;
            let acc = 0;
            const present = TYPE_ORDER.filter((t) => r[t] > 0);
            return (
              <g key={r.region_name} onMouseEnter={() => setHover(i)} opacity={hover === null || hover === i ? 1 : 0.5}>
                <rect x={0} y={cy} width={width} height={rowH} fill="transparent" />
                <text x={0} y={cy + rowH / 2} dy="0.32em" fontSize="12" fill="var(--foreground)">
                  {r.region_name}
                </text>
                {present.map((t, k) => {
                  const x0 = labelW + (acc / max) * trackW;
                  acc += r[t];
                  const x1 = labelW + (acc / max) * trackW;
                  const w = Math.max(x1 - x0 - (k < present.length - 1 ? GAP : 0), 1);
                  return <path key={t} d={barPath(x0, cy + 8, w, rowH - 16, "right", k === present.length - 1)} fill={EVENT_TYPES[t].color} />;
                })}
                <text x={labelW + (totals[i] / max) * trackW + 6} y={cy + rowH / 2} dy="0.32em" fontSize="12" fill="var(--foreground)" className="tabular">
                  {totals[i]}
                </text>
              </g>
            );
          })}
        </svg>
      ) : (
        <div style={{ height: rows.length * rowH }} />
      )}
      {hover !== null && rows[hover] ? (
        <Tooltip x={labelW + trackW / 2} y={hover * rowH + 6} width={width}>
          <p className="mb-1 font-medium">{rows[hover].region_name}: {totals[hover]} open</p>
          {TYPE_ORDER.filter((t) => rows[hover][t] > 0).map((t) => (
            <p key={t} className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5"><Swatch color={EVENT_TYPES[t].color} />{EVENT_TYPES[t].short}</span>
              <span className="tabular">{rows[hover][t]}</span>
            </p>
          ))}
        </Tooltip>
      ) : null}
    </div>
  );
}

// --- Event series: one value line, an optional reference line and target ------

export function SeriesChart({ series }: { series: SeriesOut }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const pts = series.points;
  const height = 190;
  const m = { top: 18, right: 64, bottom: 24, left: 36 };
  const times = useMemo(() => pts.map((p) => parseDay(p.day).getTime()), [pts]);
  const values = pts.flatMap((p) => [p.value, p.reference ?? p.value]);
  const ticks = niceTicks(Math.max(...values, series.target ?? 0, 0.1) * 1.08);
  const yMax = ticks[ticks.length - 1];
  const t0 = times[0] ?? 0;
  const t1 = times.at(-1) ?? 1;
  const plotW = Math.max(width - m.left - m.right, 0);
  const plotH = height - m.top - m.bottom;
  const x = (t: number) => m.left + (t1 === t0 ? plotW / 2 : ((t - t0) / (t1 - t0)) * plotW);
  const y = (v: number) => m.top + plotH - (v / yMax) * plotH;
  const line = (get: (i: number) => number | null) =>
    pts
      .map((_, i) => [x(times[i]), get(i)] as const)
      .filter(([, v]) => v !== null)
      .map(([px, v], k) => `${k === 0 ? "M" : "L"}${px.toFixed(1)},${y(v as number).toFixed(1)}`)
      .join("");
  const hasRef = pts.some((p) => p.reference !== null);
  const dots = pts.length <= 40;
  const last = pts.at(-1);
  const markerX = series.marker_day ? x(parseDay(series.marker_day).getTime()) : null;
  const fmtV = (v: number) => `${v.toFixed(series.unit === "%" ? 1 : 2)}${series.unit === "%" ? "%" : ` ${series.unit}`}`;

  function onMove(event: React.MouseEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - bounds.left;
    let best = 0;
    for (let i = 1; i < pts.length; i++) if (Math.abs(x(times[i]) - px) < Math.abs(x(times[best]) - px)) best = i;
    setHover(best);
  }

  if (pts.length === 0) {
    return <p className="rounded border p-4 text-sm text-muted-foreground">No readings in this window.</p>;
  }
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-foreground">{series.label}</p>
        <TableToggle open={table} onToggle={() => setTable((v) => !v)} />
      </div>
      {hasRef ? (
        <div className="mb-2">
          <Legend
            items={[
              { key: "v", label: series.value_label, color: "var(--series-1)" },
              { key: "r", label: series.reference_label ?? "Reference", color: "var(--chart-muted)", dashed: true },
            ]}
          />
        </div>
      ) : null}
      {table ? (
        <div className="max-h-[220px] overflow-auto rounded border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium">Week of</th>
                <th className="px-2 py-1.5 text-right font-medium">{series.value_label}</th>
                {hasRef ? <th className="px-2 py-1.5 text-right font-medium">{series.reference_label}</th> : null}
              </tr>
            </thead>
            <tbody>
              {pts.map((p) => (
                <tr key={p.day} className="border-t">
                  <td className="px-2 py-1">{fmtDate(p.day)}</td>
                  <td className={cn("px-2 py-1 text-right", series.target !== null && p.value < series.target && "font-semibold")}>{fmtV(p.value)}</td>
                  {hasRef ? <td className="px-2 py-1 text-right">{p.reference === null ? "—" : fmtV(p.reference)}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={ref} className="relative" onMouseLeave={() => setHover(null)}>
          {width > 0 ? (
            <svg width={width} height={height} onMouseMove={onMove} role="img" aria-label={`${series.label}. Use “Show the table” for every reading.`}>
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={m.left} x2={width - m.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--chart-axis)" : "var(--chart-grid)"} />
                  <text x={m.left - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize="11" fill="var(--chart-muted)" className="tabular">
                    {series.unit === "%" ? `${t}%` : t}
                  </text>
                </g>
              ))}
              <text x={m.left} y={height - 6} fontSize="11" fill="var(--chart-muted)">{fmtDate(pts[0].day)}</text>
              <text x={width - m.right} y={height - 6} fontSize="11" fill="var(--chart-muted)" textAnchor="end">{fmtDate(last?.day)}</text>
              {series.target !== null ? (
                <g>
                  <line x1={m.left} x2={width - m.right} y1={y(series.target)} y2={y(series.target)} stroke="var(--foreground)" strokeOpacity="0.55" strokeDasharray="4 3" />
                  <text x={width - m.right + 6} y={y(series.target)} dy="0.32em" fontSize="11" fill="var(--muted-foreground)">
                    {series.target_label ?? "Target"}
                  </text>
                </g>
              ) : null}
              {markerX !== null && markerX >= m.left && markerX <= width - m.right ? (
                <g>
                  <line x1={markerX} x2={markerX} y1={m.top - 4} y2={m.top + plotH} stroke="var(--chart-axis)" strokeDasharray="2 3" />
                  <text x={markerX + 4} y={m.top - 6} fontSize="11" fill="var(--muted-foreground)">
                    {series.marker_label} {fmtDate(series.marker_day)}
                  </text>
                </g>
              ) : null}
              {hasRef ? (
                <path d={line((i) => pts[i].reference)} fill="none" stroke="var(--chart-muted)" strokeWidth="2" strokeDasharray="5 3" />
              ) : null}
              <path d={line((i) => pts[i].value)} fill="none" stroke="var(--series-1)" strokeWidth="2" strokeLinejoin="round" />
              {dots
                ? pts.map((p, i) => (
                    <circle key={p.day} cx={x(times[i])} cy={y(p.value)} r="4" fill="var(--series-1)" stroke="var(--chart-surface)" strokeWidth="2" />
                  ))
                : null}
              {last ? (
                <g fontSize="11">
                  <text x={width - m.right + 6} y={y(last.value)} dy="0.32em" fill="var(--foreground)" className="tabular">
                    {fmtV(last.value)}
                  </text>
                  {hasRef && last.reference !== null && Math.abs(y(last.reference) - y(last.value)) > 12 ? (
                    <text x={width - m.right + 6} y={y(last.reference)} dy="0.32em" fill="var(--muted-foreground)" className="tabular">
                      {fmtV(last.reference)}
                    </text>
                  ) : null}
                </g>
              ) : null}
              {hover !== null ? (
                <g pointerEvents="none">
                  <line x1={x(times[hover])} x2={x(times[hover])} y1={m.top} y2={m.top + plotH} stroke="var(--chart-axis)" />
                  <circle cx={x(times[hover])} cy={y(pts[hover].value)} r="5" fill="var(--series-1)" stroke="var(--chart-surface)" strokeWidth="2" />
                </g>
              ) : null}
            </svg>
          ) : (
            <div style={{ height }} />
          )}
          {hover !== null && pts[hover] ? (
            <Tooltip x={x(times[hover])} y={y(pts[hover].value)} width={width}>
              <p className="mb-1 font-medium">{series.unit === "%" ? `Week of ${fmtDate(pts[hover].day)}` : fmtDate(pts[hover].day)}</p>
              <p className="flex justify-between gap-2"><span>{series.value_label}</span><span className="tabular">{fmtV(pts[hover].value)}</span></p>
              {pts[hover].reference !== null ? (
                <p className="flex justify-between gap-2 text-muted-foreground"><span>{series.reference_label}</span><span className="tabular">{fmtV(pts[hover].reference as number)}</span></p>
              ) : null}
              {series.target !== null ? (
                <p className="mt-1 text-muted-foreground">{pts[hover].value < series.target ? "Below" : "At or above"} the {series.target_label}</p>
              ) : null}
            </Tooltip>
          ) : null}
        </div>
      )}
    </div>
  );
}
