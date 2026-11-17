import { useQuery, useSuspenseQuery, useMutation } from "@tanstack/react-query";
import type { UseQueryOptions, UseSuspenseQueryOptions, UseMutationOptions } from "@tanstack/react-query";
export class ApiError extends Error {
    status: number;
    statusText: string;
    body: unknown;
    constructor(status: number, statusText: string, body: unknown){
        super(`HTTP ${status}: ${statusText}`);
        this.name = "ApiError";
        this.status = status;
        this.statusText = statusText;
        this.body = body;
    }
}
export interface DashboardOut {
    data_from: string;
    data_to: string;
    open_by_region: RegionOut[];
    queries: QueryOut[];
    status_saving: boolean;
    tiles: TileOut[];
    trend: TrendPoint[];
}
export interface DocumentOut {
    doc_id: string | null;
    doc_type: string | null;
    event_id: string | null;
    event_type: "major_break" | "overflow_storm" | "low_chlorine" | "leak_alert" | null;
    file_name: string;
    folder: string;
    indexed: boolean;
    last_modified: string | null;
    path: string;
    published_on: string | null;
    size_bytes: number | null;
    title: string | null;
}
export interface DocumentsOut {
    documents: DocumentOut[];
    query: QueryOut;
    root: string;
}
export interface EventDetailOut {
    event: EventOut;
    facts: Fact[];
    history: HistoryOut[];
    items: EventItem[];
    queries: QueryOut[];
    series: SeriesOut | null;
    status_note: string | null;
    status_saving: boolean;
}
export interface EventItem {
    detail: string;
    doc_id: string | null;
    doc_path: string | null;
    item_id: string;
    title: string;
}
export interface EventOut {
    asset_id: string | null;
    asset_risk_tier: string | null;
    dma_id: string | null;
    dma_name: string | null;
    doc_id: string | null;
    doc_path: string | null;
    docs_expected: number;
    docs_on_file: number;
    event_date: string;
    event_id: string;
    event_type: "major_break" | "overflow_storm" | "low_chlorine" | "leak_alert";
    impact_unit: string | null;
    impact_value: number | null;
    note: string | null;
    owner: string | null;
    plant_id: string | null;
    plant_name: string | null;
    region_id: string | null;
    region_name: string | null;
    regulator: string | null;
    regulator_notified_on: string | null;
    report_on_file: boolean;
    status: "Open" | "In review" | "Actioned" | "Closed";
    status_source: "saved" | "suggested";
    suggested_reason: string;
    suggested_status: "Open" | "In review" | "Actioned" | "Closed";
    title: string;
    updated_at: string | null;
    updated_by: string | null;
    version: number;
}
export interface EventsOut {
    data_to: string;
    events: EventOut[];
    query: QueryOut;
    status_saving: boolean;
}
export interface Fact {
    label: string;
    value: string;
}
export interface HTTPValidationError {
    detail?: ValidationError[];
}
export interface HistoryOut {
    accepted_suggestion: boolean;
    changed_at: string;
    changed_by: string;
    from_status: string | null;
    note: string | null;
    owner: string | null;
    regulator_notified_on: string | null;
    to_status: string;
}
export interface MetaOut {
    data_from: string;
    data_to: string;
    status_note: string | null;
    status_saving: boolean;
}
export interface QueryOut {
    label: string;
    sql: string;
}
export interface RegionOut {
    leak_alert: number;
    low_chlorine: number;
    major_break: number;
    overflow_storm: number;
    region_name: string;
}
export interface SeriesOut {
    label: string;
    marker_day: string | null;
    marker_label: string | null;
    points: SeriesPoint[];
    reference_label: string | null;
    target: number | null;
    target_label: string | null;
    unit: string;
    value_label: string;
}
export interface SeriesPoint {
    day: string;
    reference: number | null;
    value: number;
}
export interface StatusIn {
    accepted_suggestion?: boolean;
    expected_version: number;
    note?: string | null;
    owner?: string | null;
    regulator_notified_on?: string | null;
    request_id: string;
    status: "Open" | "In review" | "Actioned" | "Closed";
}
export interface TileOut {
    event_type: "major_break" | "overflow_storm" | "low_chlorine" | "leak_alert";
    label: string;
    last_30d: number;
    missing_report: number;
    open: number;
    total: number;
}
export interface TrendPoint {
    leak_alert: number;
    low_chlorine: number;
    major_break: number;
    month: string;
    overflow_storm: number;
}
export interface ValidationError {
    ctx?: Record<string, unknown>;
    input?: unknown;
    loc: (string | number)[];
    msg: string;
    type: string;
}
export interface VersionOut {
    version: string;
}
export const getDashboard = async (options?: RequestInit): Promise<{
    data: DashboardOut;
}> =>{
    const res = await fetch("/api/dashboard", {
        ...options,
        method: "GET"
    });
    if (!res.ok) {
        const body = await res.text();
        let parsed: unknown;
        try {
            parsed = JSON.parse(body);
        } catch  {
            parsed = body;
        }
        throw new ApiError(res.status, res.statusText, parsed);
    }
    return {
        data: await res.json()
    };
};
export const getDashboardKey = ()=>{
    return [
        "/api/dashboard"
    ] as const;
};
export function useGetDashboard<TData = {
    data: DashboardOut;
}>(options?: {
    query?: Omit<UseQueryOptions<{
        data: DashboardOut;
    }, ApiError, TData>, "queryKey" | "queryFn">;
}) {
    return useQuery({
        queryKey: getDashboardKey(),
        queryFn: ()=>getDashboard(),
        ...options?.query
    });
}
export function useGetDashboardSuspense<TData = {
    data: DashboardOut;
}>(options?: {
    query?: Omit<UseSuspenseQueryOptions<{
        data: DashboardOut;
    }, ApiError, TData>, "queryKey" | "queryFn">;
}) {
    return useSuspenseQuery({
        queryKey: getDashboardKey(),
        queryFn: ()=>getDashboard(),
        ...options?.query
    });
}
export const listDocuments = async (options?: RequestInit): Promise<{
    data: DocumentsOut;
}> =>{
    const res = await fetch("/api/documents", {
        ...options,
        method: "GET"
    });
    if (!res.ok) {
        const body = await res.text();
        let parsed: unknown;
        try {
            parsed = JSON.parse(body);
        } catch  {
            parsed = body;
        }
        throw new ApiError(res.status, res.statusText, parsed);
    }
    return {
        data: await res.json()
    };
};
export const listDocumentsKey = ()=>{
    return [
        "/api/documents"
    ] as const;
};
export function useListDocuments<TData = {
    data: DocumentsOut;
}>(options?: {
    query?: Omit<UseQueryOptions<{
        data: DocumentsOut;
    }, ApiError, TData>, "queryKey" | "queryFn">;
}) {
    return useQuery({
        queryKey: listDocumentsKey(),
        queryFn: ()=>listDocuments(),
        ...options?.query
    });
}
export function useListDocumentsSuspense<TData = {
    data: DocumentsOut;
}>(options?: {
    query?: Omit<UseSuspenseQueryOptions<{
        data: DocumentsOut;
    }, ApiError, TData>, "queryKey" | "queryFn">;
}) {
    return useSuspenseQuery({
        queryKey: listDocumentsKey(),
        queryFn: ()=>listDocuments(),
        ...options?.query
    });
}
export const listEvents = async (options?: RequestInit): Promise<{
    data: EventsOut;
}> =>{
    const res = await fetch("/api/events", {
        ...options,
        method: "GET"
    });
    if (!res.ok) {
        const body = await res.text();
        let parsed: unknown;
        try {
            parsed = JSON.parse(body);
        } catch  {
            parsed = body;
        }
        throw new ApiError(res.status, res.statusText, parsed);
    }
    return {
        data: await res.json()
    };
};
export const listEventsKey = ()=>{
    return [
        "/api/events"
    ] as const;
};
export function useListEvents<TData = {
    data: EventsOut;
}>(options?: {
    query?: Omit<UseQueryOptions<{
        data: EventsOut;
    }, ApiError, TData>, "queryKey" | "queryFn">;
}) {
    return useQuery({
        queryKey: listEventsKey(),
        queryFn: ()=>listEvents(),
        ...options?.query
    });
}
export function useListEventsSuspense<TData = {
    data: EventsOut;
}>(options?: {
    query?: Omit<UseSuspenseQueryOptions<{
        data: EventsOut;
    }, ApiError, TData>, "queryKey" | "queryFn">;
}) {
    return useSuspenseQuery({
        queryKey: listEventsKey(),
        queryFn: ()=>listEvents(),
        ...options?.query
    });
}
export interface GetEventParams {
    event_type: "major_break" | "overflow_storm" | "low_chlorine" | "leak_alert";
    event_id: string;
}
export const getEvent = async (params: GetEventParams, options?: RequestInit): Promise<{
    data: EventDetailOut;
}> =>{
    const res = await fetch(`/api/events/${params.event_type}/${params.event_id}`, {
        ...options,
        method: "GET"
    });
    if (!res.ok) {
        const body = await res.text();
        let parsed: unknown;
        try {
            parsed = JSON.parse(body);
        } catch  {
            parsed = body;
        }
        throw new ApiError(res.status, res.statusText, parsed);
    }
    return {
        data: await res.json()
    };
};
export const getEventKey = (params?: GetEventParams)=>{
    return [
        "/api/events/{event_type}/{event_id}",
        params
    ] as const;
};
export function useGetEvent<TData = {
    data: EventDetailOut;
}>(options: {
    params: GetEventParams;
    query?: Omit<UseQueryOptions<{
        data: EventDetailOut;
    }, ApiError, TData>, "queryKey" | "queryFn">;
}) {
    return useQuery({
        queryKey: getEventKey(options.params),
        queryFn: ()=>getEvent(options.params),
        ...options?.query
    });
}
export function useGetEventSuspense<TData = {
    data: EventDetailOut;
}>(options: {
    params: GetEventParams;
    query?: Omit<UseSuspenseQueryOptions<{
        data: EventDetailOut;
    }, ApiError, TData>, "queryKey" | "queryFn">;
}) {
    return useSuspenseQuery({
        queryKey: getEventKey(options.params),
        queryFn: ()=>getEvent(options.params),
        ...options?.query
    });
}
export interface UpdateEventStatusParams {
    event_type: "major_break" | "overflow_storm" | "low_chlorine" | "leak_alert";
    event_id: string;
    "X-Forwarded-Host"?: string | null;
    "X-Forwarded-Preferred-Username"?: string | null;
    "X-Forwarded-User"?: string | null;
    "X-Forwarded-Email"?: string | null;
    "X-Request-Id"?: string | null;
    "X-Forwarded-Access-Token"?: string | null;
}
export const updateEventStatus = async (params: UpdateEventStatusParams, data: StatusIn, options?: RequestInit): Promise<{
    data: EventOut;
}> =>{
    const res = await fetch(`/api/events/${params.event_type}/${params.event_id}/status`, {
        ...options,
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            ...(params?.["X-Forwarded-Host"] != null && {
                "X-Forwarded-Host": params["X-Forwarded-Host"]
            }),
            ...(params?.["X-Forwarded-Preferred-Username"] != null && {
                "X-Forwarded-Preferred-Username": params["X-Forwarded-Preferred-Username"]
            }),
            ...(params?.["X-Forwarded-User"] != null && {
                "X-Forwarded-User": params["X-Forwarded-User"]
            }),
            ...(params?.["X-Forwarded-Email"] != null && {
                "X-Forwarded-Email": params["X-Forwarded-Email"]
            }),
            ...(params?.["X-Request-Id"] != null && {
                "X-Request-Id": params["X-Request-Id"]
            }),
            ...(params?.["X-Forwarded-Access-Token"] != null && {
                "X-Forwarded-Access-Token": params["X-Forwarded-Access-Token"]
            }),
            ...options?.headers
        },
        body: JSON.stringify(data)
    });
    if (!res.ok) {
        const body = await res.text();
        let parsed: unknown;
        try {
            parsed = JSON.parse(body);
        } catch  {
            parsed = body;
        }
        throw new ApiError(res.status, res.statusText, parsed);
    }
    return {
        data: await res.json()
    };
};
export function useUpdateEventStatus(options?: {
    mutation?: UseMutationOptions<{
        data: EventOut;
    }, ApiError, {
        params: UpdateEventStatusParams;
        data: StatusIn;
    }>;
}) {
    return useMutation({
        mutationFn: (vars)=>updateEventStatus(vars.params, vars.data),
        ...options?.mutation
    });
}
export const getMeta = async (options?: RequestInit): Promise<{
    data: MetaOut;
}> =>{
    const res = await fetch("/api/meta", {
        ...options,
        method: "GET"
    });
    if (!res.ok) {
        const body = await res.text();
        let parsed: unknown;
        try {
            parsed = JSON.parse(body);
        } catch  {
            parsed = body;
        }
        throw new ApiError(res.status, res.statusText, parsed);
    }
    return {
        data: await res.json()
    };
};
export const getMetaKey = ()=>{
    return [
        "/api/meta"
    ] as const;
};
export function useGetMeta<TData = {
    data: MetaOut;
}>(options?: {
    query?: Omit<UseQueryOptions<{
        data: MetaOut;
    }, ApiError, TData>, "queryKey" | "queryFn">;
}) {
    return useQuery({
        queryKey: getMetaKey(),
        queryFn: ()=>getMeta(),
        ...options?.query
    });
}
export function useGetMetaSuspense<TData = {
    data: MetaOut;
}>(options?: {
    query?: Omit<UseSuspenseQueryOptions<{
        data: MetaOut;
    }, ApiError, TData>, "queryKey" | "queryFn">;
}) {
    return useSuspenseQuery({
        queryKey: getMetaKey(),
        queryFn: ()=>getMeta(),
        ...options?.query
    });
}
export const version = async (options?: RequestInit): Promise<{
    data: VersionOut;
}> =>{
    const res = await fetch("/api/version", {
        ...options,
        method: "GET"
    });
    if (!res.ok) {
        const body = await res.text();
        let parsed: unknown;
        try {
            parsed = JSON.parse(body);
        } catch  {
            parsed = body;
        }
        throw new ApiError(res.status, res.statusText, parsed);
    }
    return {
        data: await res.json()
    };
};
export const versionKey = ()=>{
    return [
        "/api/version"
    ] as const;
};
export function useVersion<TData = {
    data: VersionOut;
}>(options?: {
    query?: Omit<UseQueryOptions<{
        data: VersionOut;
    }, ApiError, TData>, "queryKey" | "queryFn">;
}) {
    return useQuery({
        queryKey: versionKey(),
        queryFn: ()=>version(),
        ...options?.query
    });
}
export function useVersionSuspense<TData = {
    data: VersionOut;
}>(options?: {
    query?: Omit<UseSuspenseQueryOptions<{
        data: VersionOut;
    }, ApiError, TData>, "queryKey" | "queryFn">;
}) {
    return useSuspenseQuery({
        queryKey: versionKey(),
        queryFn: ()=>version(),
        ...options?.query
    });
}
