import {
  AlertCircle,
  CheckCircle2,
  CloudRain,
  Droplets,
  Eye,
  FlaskConical,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import type { EventOut } from "@/lib/api";

export type EventType = EventOut["event_type"];
export type Status = EventOut["status"];

/** One hue per event type, in the validated categorical order. */
export const EVENT_TYPES: Record<
  EventType,
  { label: string; plural: string; short: string; color: string; icon: LucideIcon; report: string }
> = {
  major_break: {
    label: "Major main break",
    plural: "Major main breaks",
    short: "Main break",
    color: "var(--series-1)",
    icon: Wrench,
    report: "incident report",
  },
  overflow_storm: {
    label: "Storm overflow event",
    plural: "Storm overflow events",
    short: "Storm overflows",
    color: "var(--series-2)",
    icon: CloudRain,
    report: "overflow reports",
  },
  low_chlorine: {
    label: "Low-chlorine case",
    plural: "Low-chlorine cases",
    short: "Low chlorine",
    color: "var(--series-3)",
    icon: FlaskConical,
    report: "water quality notice",
  },
  leak_alert: {
    label: "Leak alert",
    plural: "Leak alerts",
    short: "Leak alert",
    color: "var(--series-4)",
    icon: Droplets,
    report: "no report type",
  },
};

export const TYPE_ORDER: EventType[] = ["major_break", "overflow_storm", "low_chlorine", "leak_alert"];

export const STATUSES: Status[] = ["Open", "In review", "Actioned", "Closed"];

export const STATUS_META: Record<Status, { icon: LucideIcon; color: string; rank: number; hint: string }> = {
  Open: { icon: AlertCircle, color: "var(--status-open)", rank: 0, hint: "Needs someone to pick it up" },
  "In review": { icon: Eye, color: "var(--status-review)", rank: 1, hint: "Report on file, being reviewed" },
  Actioned: { icon: Wrench, color: "var(--status-actioned)", rank: 2, hint: "Follow-up work under way" },
  Closed: { icon: CheckCircle2, color: "var(--status-closed)", rank: 3, hint: "Nothing left to do" },
};

const dateFormat = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric" });
const monthFormat = new Intl.DateTimeFormat("en-AU", { month: "short", year: "2-digit" });
const longMonthFormat = new Intl.DateTimeFormat("en-AU", { month: "long", year: "numeric" });
const numberFormat = new Intl.NumberFormat("en-AU");

/** Parses YYYY-MM-DD as a local calendar date, never as UTC midnight. */
export function parseDay(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export const fmtDate = (iso: string | null | undefined) => (iso ? dateFormat.format(parseDay(iso)) : "—");
export const fmtMonth = (yyyyMm: string) => monthFormat.format(parseDay(`${yyyyMm}-01`));
export const fmtLongMonth = (yyyyMm: string) => longMonthFormat.format(parseDay(`${yyyyMm}-01`));
export const fmtNumber = (n: number) => numberFormat.format(n);

export function fmtDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function fmtImpact(e: Pick<EventOut, "impact_value" | "impact_unit" | "event_type">): string {
  if (e.impact_value == null) return "—";
  switch (e.event_type) {
    case "major_break":
      return `${fmtNumber(e.impact_value)} customers`;
    case "overflow_storm":
      return `${fmtNumber(Math.round(e.impact_value))} kL`;
    case "low_chlorine":
      return `${e.impact_value.toFixed(2)} mg/L low`;
    case "leak_alert":
      return `${e.impact_value.toFixed(1)} ML lost*`;
  }
}

export function fmtReports(e: Pick<EventOut, "docs_on_file" | "docs_expected">): string {
  if (e.docs_expected === 0) return "—";
  return `${e.docs_on_file} of ${e.docs_expected}`;
}

export const eventKey = (e: Pick<EventOut, "event_type" | "event_id">) => `${e.event_type}|${e.event_id}`;

export function pdfUrl(path: string): string {
  return `/api/documents/pdf?path=${encodeURIComponent(path)}`;
}

/** A short list title; the full title stays in the detail panel. */
export function shortTitle(e: Pick<EventOut, "event_type" | "event_id" | "title" | "dma_name" | "plant_name">): string {
  switch (e.event_type) {
    case "major_break":
      return `${e.title.split(" ")[0]} · ${e.dma_name ?? e.event_id}`;
    case "overflow_storm":
      return `${(e.plant_name ?? e.event_id).replace(" Wastewater Treatment Plant", "")} catchment storm`;
    case "low_chlorine":
      return `${e.dma_name ?? e.event_id} · ${e.event_id.split(":")[1]?.replace("-", " ") ?? ""}`;
    case "leak_alert":
      return `${e.dma_name ?? e.event_id} leak alert`;
  }
}
