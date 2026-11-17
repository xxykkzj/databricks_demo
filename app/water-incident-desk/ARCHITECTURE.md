# Incident & Report Desk (`water-incident-desk`): architecture

> **Status: v2, 2026-11-17.** The attendee approved v1 (D1 to D7). v2 adds D8 to D12 after
> Genie Code reviewed v1, with three changes:
> - overflows are grouped by storm;
> - leak alerts and pipe risk are read from the attendee's gold layer;
> - section 5.6 maps each concept to the one object that defines it.
>
> Lives in `~/projects/water-incident-desk/` (synced to
> `/Workspace/Users/labuser+106@awsbricks.com/projects/water-incident-desk/`), with `sql/`
> beside it and reports in `docs/`.
>
> **Readers:** the data engineering (DE) subagent (start at section 9); Genie Code (sections
> 5.6 and 8); Claude Code (architect, app builder); and the attendee, who decides everything in section 11.

## 1. Purpose

One place for a water utility operations or compliance officer to see major
events, decide what happens next, and read the report PDF beside each record.

- **Primary action:** update an event's status (owner, note, regulator-notified date).
- **Data:** `workshop_demo.water_utilities`, a **synthetic** utility (Torrens Gulf
  Water Corporation, real South Australian places), 1 Jan 2025 to **12 Nov 2026**.
  Anchor "recent" to 12 Nov 2026, never to today.

## 2. Scope

| v1 (in) | Parked (out) |
|---|---|
| Dashboard: tiles, monthly trend, open items by region | Genie chat inside the app |
| Register of **173** events in 4 types, with filters | Map |
| Status updates saved to Lakebase, with full history | AI summaries or extraction of PDF facts |
| Suggested status derived from the data | Uploading PDFs from the app |
| Regulator-notified date per event | Alerts, e-mail, roles and permissions |
| PDF viewer beside the record; Documents tab listing the raw volume live | Customers and billing (no signal in that data) |

## 3. System context

```
 Attendee's browser
   │  React + shadcn (APX UI)
   ▼
 Databricks App: water-incident-desk (FastAPI, runs as the app service principal)
   ├─ SQL warehouse ace3100edf02c9ff ──► adllabs_096.default desk views (sec. 5)
   │                                        ├─► workshop_demo.water_utilities (source facts, read in place)
   │                                        └─► adllabs_096.water_utilities_medallion gold_* (leak alert, pipe risk)
   ├─ Files API ──────────────────────► /Volumes/workshop_demo/water_utilities/raw/**/*.pdf
   └─ Postgres (OAuth token) ─────────► Lakebase project water-incident-desk, schema incident_desk (sec. 6)

 Genie Code (attendee's workspace agent) ──► builds the medallion pipeline (bronze → silver → gold)
 Genie One (attendee's business-context chat) ──► reads both layers; section 5.6 says which object owns which concept
```

Three building blocks, each with one job:

- **Delta views** hold the definitions: what counts as an event, and its suggested status.
- **Lakebase** holds what people decide: status, owner, note, history. These are small transactional writes, which is what Postgres is for.
- **The App** joins the two and shows the PDFs.

## 4. Identities and permissions (checked 2026-11-17)

| Identity | Used for | Access, and where it comes from |
|---|---|---|
| Build identity: `databricks` CLI, profile `DEFAULT` | desk views, the Lakebase project, deploying | MANAGE and ALL PRIVILEGES on `adllabs_096` (verified). It owns the desk views, so the views read gold with its rights. |
| Attendee: `databricks-me` CLI, profile `me`; also Genie Code and Genie One | the medallion pipeline, business questions | ALL PRIVILEGES on `adllabs_096`; reads `workshop_demo` (verified) |
| App service principal (created at first deploy) | every read and write the app makes | `workshop_demo`: `account users` hold USE CATALOG, USE SCHEMA, SELECT, READ VOLUME. `adllabs_096.default`: `account users` hold USE SCHEMA and SELECT (verified by the DE subagent). Lakebase: CAN_CONNECT_AND_CREATE through the app resource. |
| Signed-in user | audit fields only (`X-Forwarded-Email`) | no data access on their behalf in v1 |

**Hard rules for every agent:**
- Never create, write or GRANT anything in `workshop_demo`.
- Never query `system.*`.
- Never create a catalog.
- Desk objects live only in `adllabs_096.default`, the workshop's schema for this seat.
- `adllabs_096.water_utilities_medallion` belongs to the attendee's pipeline (Genie Code): read it, never write to it.
- Never print credentials or tokens.
- Never stop or kill processes you did not start.
- Never delete what you did not create.

## 5. Data layer (owned by the DE subagent)

### 5.1 Sources

| Object | Used for | Key columns |
|---|---|---|
| `workshop_demo…main_breaks` | major breaks | `break_id`, `main_id`, `dma_id`, `region_id`, `failed_on`, `is_major`, `customers_affected` |
| `workshop_demo…sewer_overflows` | storm overflow events | `overflow_id`, `sewer_main_id`, `plant_id`, `overflow_on`, `is_major`, `volume_kl` |
| `workshop_demo…water_quality_samples` | chlorine cases | `dma_id`, `sampled_on`, `free_chlorine_mg_l`, `below_chlorine_target` |
| `workshop_demo…documents` | PDF index (56 rows) | `doc_id`, `doc_type`, `volume_path`, `break_id`, `overflow_id`, `dma_id`, `published_on` |
| `workshop_demo…district_metered_areas`, `service_regions`, `treatment_plants` | names and regions | `dma_id`, `dma_name`, `region_id`, `region_name`, `plant_id`, `plant_name` |
| `workshop_demo…water_mains`, `sewer_mains` | asset facts on the detail panel | `main_id`, `install_year`; `sewer_main_id`, `has_ii_defect` |
| `medallion.gold_dma_nrw_daily` | **leak alerts** (rule owned by gold) | `dma_id`, `obs_date`, `leak_alert`, `inflow_ml`, `nrw_excess_vs_peer_pp`, `mnf_vs_peer_ratio_14d` |
| `medallion.gold_main_break_risk` | **pipe risk** (rule owned by gold) | `main_id`, `risk_tier`, `risk_pct_rank`, `risk_score` |

`medallion` = `adllabs_096.water_utilities_medallion`.

### 5.2 Desk objects in `adllabs_096.default`

The logic below was tested read-only on 2026-11-17. The tested v2 bodies are in
`sql/v2-tested/` (`__MEMBERS__` stands for `adllabs_096.default.overflow_storm_members`)
until the DE subagent writes the final files (task T7) and removes that folder. Order:

1. `sql/01_wq_low_chlorine_cases.sql`: view `wq_low_chlorine_cases`, one row per DMA per summer with a case (76 rows). **Unchanged.**
2. `sql/02_overflow_storm_members.sql`: **new** view `overflow_storm_members`, one row per major overflow with its `storm_id` and report (439 rows, 53 storms).
3. `sql/03_incident_events.sql`: view `incident_events`, **the contract** (173 rows, below).
4. `sql/04_incident_documents.sql`: view `incident_documents`, one row per indexed PDF with its event (56 rows).

**`incident_events` column contract (v2).** The app depends on these exact names, order
and types. A change goes through Claude Code, never directly.

| Column | Type | Meaning |
|---|---|---|
| `event_type` | STRING | `major_break` · `overflow_storm` · `low_chlorine` · `leak_alert` |
| `event_id` | STRING | `break_id` · `<plant_id>:<date>` · `<dma_id>:summer-YYYY-YY` · `<dma_id>:<alert start date>` |
| `event_date` | DATE | failure date · storm day · case opened · alert started |
| `title` | STRING | readable one-liner |
| `region_id`, `region_name` | STRING | service region |
| `dma_id`, `dma_name` | STRING | null for storms (the sewer network has no DMAs) |
| `plant_id`, `plant_name` | STRING | wastewater plant (storms) · supplying plant (chlorine, leak) · null (breaks) |
| `asset_id` | STRING | `main_id` for breaks, otherwise null |
| `asset_risk_tier` | STRING | breaks only: High · Medium · Low from `gold_main_break_risk` |
| `impact_value`, `impact_unit` | DOUBLE, STRING | customers affected · kL spilled · lowest free chlorine mg/L · ML lost above peer level (estimate) |
| `doc_id`, `doc_path` | STRING | the one linked PDF; null for storms (their PDFs are per overflow, in `overflow_storm_members`) and for leaks |
| `docs_on_file`, `docs_expected` | INT | reports on file / reports due: 1/1 or 0/1 for a break or chlorine case, n/m for a storm, 0/0 for a leak |
| `report_on_file` | BOOLEAN | `docs_expected > 0` and every expected report is on file |
| `regulator` | STRING | `SA Health` (chlorine) · `EPA SA` (storms) · null (assumption A3) |
| `suggested_status`, `suggested_reason` | STRING | derived status and plain-English reason (5.3) |

### 5.3 Business rules

| # | Rule | Source |
|---|---|---|
| R1 | Major break = `main_breaks.is_major` (300+ customers affected). Major overflow = `sewer_overflows.is_major` (5,000+ kL). | column comments |
| R2 | Summer = **1 Dec to 31 Mar**, as the notices count it. | verified on DMA-EYY-003 |
| R3 | Low-chlorine case = **4 or more consecutive weekly samples below 0.5 mg/L** within one summer, opening on the first sample of the first such run. | D4 |
| R4 | Closure test = the first sample date after opening on which 4 weekly samples in a row are at or above 0.5 mg/L. | the notices' own action text |
| R5 | Suggested status. **Break:** report on file → In review, else Open ("Report due"). **Storm:** every overflow reported → In review, else Open ("Reports due: k of n"). **Chlorine:** no notice → Open ("Notice due"); notice and test met → Closed; notice and test not met → Actioned. **Leak:** alert still active on the last day of data → Open, cleared → Closed. | D5, D8, D9 |
| R6 | Effective status (in the app) = the saved Lakebase status if one exists, otherwise the suggested status, shown as "suggested". | design |
| R7 | Storm event = every major overflow on one day draining to one wastewater plant. | D8 |
| R8 | Leak alert event = one run of consecutive days with `gold_dma_nrw_daily.leak_alert` true for a DMA. The alert rule is gold's; the desk only groups days into episodes. Impact = Σ `inflow_ml × max(nrw_excess_vs_peer_pp, 0) / 100`, labelled an estimate. | D9 |
| R9 | Pipe risk on a break = `gold_main_break_risk.risk_tier` of its main. | D9 |

### 5.4 Acceptance checks (v2 expected values)

| # | Check | Expected |
|---|---|---|
| C1 | events, reports and duplicates by type | `leak_alert` 1, docs 0/0 · `low_chlorine` 76, docs 12/76 · `major_break` 43, docs 25/43 · `overflow_storm` 53, docs 12/439, 0 fully reported · 0 duplicate `event_id`s · 173 in total |
| C2 | suggested status mix | leak Open 1 · chlorine Closed 12, Open 64 · break In review 25, Open 18 · storm Open 53 |
| C3 | PDF links | (none) 7 · `low_chlorine` 12 · `major_break` 25 · `overflow_storm` 12 · 0 orphan links |
| C4 | chlorine cases (unchanged) | 2024-25: 37 cases, partial · 2025-26: 39 cases, 12 notices, notices close 2026-04-22 to 2026-04-28 |
| C5 | distance (unchanged) | every 2025-26 case DMA > 25 km from its plant |
| C6 | spot checks | `WM028204-20260501`: 1186 customers, In review · `WWTP-GLE:2025-09-27`: 355,753.6 kL, docs 10/28, Open · `DMA-EYY-003:summer-2025-26`: Closed · `DMA-ADS-007:2025-07-04`: leak, 20.2 ML, Open, 497 days |
| C7 | risk tier on breaks | High 9 · Medium 23 · Low 11 (all 43 have a tier) |
| C8 | `overflow_storm_members` | 439 rows · 53 distinct `storm_id` · 12 with a report |
| C9 | volume | all 56 `doc_path`s exist as files |

### 5.5 Genie One readiness

- Every desk view and every desk column has a COMMENT. Write them in the `CREATE VIEW` column list, and avoid `''` inside comments, because this warehouse joins adjacent strings (DE report, surprise 1).
- The gold columns the desk reads must have comments too. That is Genie Code's task (section 8).

Questions the attendee can then ask Genie One:
- "Which storm events have reports due, by wastewater plant?"
- "How long has the Unley DMA 7 leak alert been open?"
- "How many major breaks were on high-risk mains?"

### 5.6 Definitions map: one concept, one object

Unification rule (D10): every business concept has **exactly one** defining object. Other
objects read it; they never redefine it. Where the desk and gold disagree, this map wins,
and the attendee settles anything it does not cover.

| Concept | Defined in (only here) | Owner | Read by |
|---|---|---|---|
| Major break, major overflow | `is_major` in `workshop_demo` (source fact) | source | desk, gold |
| Storm overflow event | `default.overflow_storm_members` / `incident_events` | DE subagent | app, Genie One |
| Low-chlorine case and its closure test | `default.wq_low_chlorine_cases` | DE subagent | app, Genie One |
| Report coverage and suggested status | `default.incident_events` | DE subagent | app, Genie One |
| Leak alert (daily flag): 14-day average night flow per 1,000 connections ≥ 1.06× the network median **and** NRW ≥ 0.75 points above it (`leak_alert_daily` is a stricter one-day rule, ≥ 1.25×) | `medallion.gold_dma_nrw_daily.leak_alert` | gold subagent (was Genie Code) | desk (episodes), Genie One |
| Pipe break risk (likelihood): the main's own breaks blended with its material × era × soil cohort rate (weight 1.68 km-years), breaks per km-year; `risk_pct_rank` 0 = riskiest; High ≤ 0.05, Medium ≤ 0.20, Low otherwise | `medallion.gold_main_break_risk.risk_tier` | gold subagent (was Genie Code) | desk (break details, labelled as including the break), Genie One |
| NRW, night flow baselines, peer comparison | `medallion.gold_dma_nrw_daily` | Genie Code | Genie One |
| Billing KPIs | `medallion.gold_customer_billing_quarterly` | Genie Code | Genie One (out of desk scope) |
| Saved status, owner, note, history | Lakebase `incident_desk.*` | app | app only |

## 6. Operational store: Lakebase (owned by the app)

- **Project:** `water-incident-desk`, created by the DE subagent.
  - Branch: `projects/water-incident-desk/branches/production`
  - Database resource: `projects/water-incident-desk/branches/production/databases/databricks-postgres`
  - Endpoint: `projects/water-incident-desk/branches/production/endpoints/primary`
  - Postgres database name: `databricks_postgres`
- **Idle suspend:** the endpoint suspends after 24 hours idle (D11). The one existing project,
  `omnigent-…`, belongs to the workshop tooling: never use or change it.
- **The app creates its schema and tables at startup**, so its service principal owns
  them. No other agent creates or alters `incident_desk`; if one does, the deployed app
  fails with `permission denied for schema`.
- **Connection:** the platform injects `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`,
  `PGSSLMODE` and `LAKEBASE_ENDPOINT`. The password is
  `w.postgres.generate_database_credential(endpoint=LAKEBASE_ENDPOINT).token`,
  refreshed 5 minutes before its 1-hour expiry, through a psycopg 3 pool that checks each
  connection before handing it out.

```sql
CREATE SCHEMA IF NOT EXISTS incident_desk;

CREATE TABLE IF NOT EXISTS incident_desk.event_status (       -- one row per event, upserted
  event_type            text NOT NULL CHECK (event_type IN ('major_break','overflow_storm','low_chlorine','leak_alert')),
  event_id              text NOT NULL,
  status                text NOT NULL CHECK (status IN ('Open','In review','Actioned','Closed')),
  owner                 text,
  note                  text,
  regulator             text,
  regulator_notified_on date,
  version               integer NOT NULL DEFAULT 1,           -- optimistic concurrency
  updated_by            text NOT NULL,                        -- X-Forwarded-Email
  updated_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_type, event_id)
);

CREATE TABLE IF NOT EXISTS incident_desk.event_status_history ( -- append-only audit trail
  history_id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id            uuid NOT NULL UNIQUE,                 -- client idempotency key
  event_type            text NOT NULL,
  event_id              text NOT NULL,
  from_status           text,
  to_status             text NOT NULL,
  owner                 text,
  note                  text,
  regulator             text,
  regulator_notified_on date,
  accepted_suggestion   boolean NOT NULL DEFAULT false,
  changed_by            text NOT NULL,
  changed_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_status_history_event_idx
  ON incident_desk.event_status_history (event_type, event_id, changed_at DESC);
```

**Write semantics.** One transaction does three things:
- If this `request_id` is already in history, it is a repeat click: return the saved state unchanged.
- Upsert `event_status` on `(event_type, event_id)`, only if `version` still matches. If it doesn't, roll back and return `409` ("someone changed this, reload").
- Insert the history row.

The Save button disables while the request is in flight.

## 7. Application (owned by Claude Code)

APX: FastAPI + Pydantic backend, React + TanStack Router + shadcn UI, client generated from OpenAPI.

| Method | Path | operation_id | Reads / writes |
|---|---|---|---|
| GET | `/api/meta` | `getMeta` | data window: min/max `obs_date` of `dma_flow_daily` (to 2026-11-12) and whether status saving is on |
| GET | `/api/dashboard` | `getDashboard` | tiles, monthly trend, open events by region, all from `incident_events` and the effective status |
| GET | `/api/events` | `listEvents` | `incident_events` merged with `event_status` in the API (173 rows); filtering happens in the UI |
| GET | `/api/events/{event_type}/{event_id}` | `getEvent` | event, source facts by key, the storm's overflows or the weekly chlorine series, status and history |
| PUT | `/api/events/{event_type}/{event_id}/status` | `updateEventStatus` | Lakebase write (section 6) |
| GET | `/api/documents` | `listDocuments` | live listing of `raw/**` merged with `incident_documents`; PDFs with no index row are flagged "not indexed" |
| GET | `/api/documents/pdf?path=…` | `getDocumentPdf` | the file's bytes (`application/pdf`), rendered in the page with PDF.js |

**Rules:**
- **SQL:** parameterised statements only, never IDs formatted into strings. Each panel has "Show the query", so the SQL stays visible.
- **PDF paths:** allowed only under `/Volumes/workshop_demo/water_utilities/raw/`, ending `.pdf`, and present in the live listing. Anything else returns 404.
- **Screens:** Dashboard `/`, Register `/events` with a side panel (record facts, status form, history, PDF), Documents `/documents`.
- **Config:** `databricks.yml` resources are `sql-warehouse` (`ace3100edf02c9ff`, CAN_USE) and `postgres` (branch and database from section 6, CAN_CONNECT_AND_CREATE). `app.yml` reads `WAREHOUSE_ID` from `sql-warehouse` and `LAKEBASE_ENDPOINT` from `postgres`.
- **Ship:** `apx dev check`, then `apx build`, then deploy only with the workshop deploy tool.

## 8. Team and reporting back

| Who | Role | Reports back through |
|---|---|---|
| Attendee | owns the goal and every decision | chat with Claude Code; the "Your build" panel |
| Genie One | the attendee's business-context chat over both layers | the attendee: a Genie answer becomes a rule only once the attendee confirms it |
| Genie Code | the attendee's workspace agent; owns the medallion pipeline (gold) | a review file in the workspace (below), relayed or read by Claude Code |
| Claude Code | architect, app builder, keeper of this doc | decision log (sec. 11) and `workshop-workflow decide` |
| DE subagent | desk views, Lakebase project, permission checks | `docs/de-report.md` plus its final message to Claude Code |

- **Genie One → Claude Code.** Tell Claude Code what Genie One said, paste the answer, or share
  the thread link. Claude Code can also put the same question to Genie One as the attendee
  (`databricks-me genie ask "<question>" --include-sql`, verified 2026-11-17).
- **Genie Code → Claude Code.** Genie Code reads this doc and `docs/de-report.md` in the synced
  workspace folder. It writes its review to
  `/Workspace/Users/labuser+106@awsbricks.com/handoff/genie-code-review.md`, outside the synced
  project, so no sync can overwrite it. Claude Code reads that file with the build identity.
  **Handover (D13).** The attendee retired Genie Code. Its lane passes to Claude Code's gold
  subagent, under the same rules plus one more: comments only. Any change to gold *logic* needs the attendee.
  The items below now belong to that subagent, which reports in `docs/gold-report.md`.
  **Lanes.** Genie Code works only on `adllabs_096.water_utilities_medallion`, its own pipeline.
  It never runs section 9 tasks and never creates or replaces objects in `adllabs_096.default` or
  Lakebase. It re-ran v1 T1–T4 at 00:50 on 2026-11-17, which moved ownership of
  `wq_low_chlorine_cases` to the attendee; the DE subagent restores it in T7. Its work items (D12):
  1. Comment the 32 uncommented gold columns **in the pipeline source**, so a refresh keeps them.
     Say plainly that `risk_pct_rank` is descending (0 = riskiest main), and state the rule and
     thresholds behind `leak_alert` and `leak_alert_daily`, so section 5.6 can record them.
  2. Confirm gold counts "major" with `is_major` (`major_breaks`, `major_main_breaks`), and keep the
     leak and risk rules in gold only.
  3. Review `docs/de-report.md` (v2 section) against sections 5.3 and 5.6, then write findings to
     the handoff file above. Flag, don't fix, anything in the desk.
- **DE subagent → Claude Code.** `docs/de-report.md`: what it created, each check (expected,
  actual, pass) and any surprises. It never changes a rule or the contract to make a check
  pass: it stops and asks.

## 9. DE subagent work order

Work only in `adllabs_096.default` and the Lakebase project, with profile `DEFAULT` and
warehouse `ace3100edf02c9ff`. Section 4's hard rules apply. T1–T4 and T6 are done (v1).

| Task | What | Done when |
|---|---|---|
| T1–T4, T6 | v1 views, checks, volume, Lakebase project, report | done 2026-11-17 |
| T5 | Check the app's identity can `SELECT` the desk views | done 2026-11-17: `workshop-grant-me` handed the app identity (`cadf6299-…`) USE SCHEMA and SELECT on `adllabs_096`, and the deployed app renders every view as the attendee |
| T7 | v2: write `sql/02`–`04` from the tested bodies, renumbering the v1 files to match. Create `overflow_storm_members`, then replace `incident_events` and `incident_documents`, all with column comments | the 4 desk views exist; `incident_events` matches the v2 contract exactly |
| T8 | v2: rewrite `sql/05_acceptance_checks.sql` for C1–C9 (5.4) and run it | every value matches |
| T9 | Update `docs/de-report.md` with a v2 section | Claude Code has read it |

## 10. Build sequence (times are estimates)

1. Done: approval, scaffold, v1 data layer, Lakebase project.
2. Now: DE subagent runs T7–T9 while Claude Code builds slice 1 against the v2 contract (about 30 min).
3. Slice 2: Lakebase status, owner, note, regulator date and history, then deploy and T5 (about 20 min).
4. Check as the attendee and share the URL. Any test status is labelled as a test, written only with the attendee's OK, and removed afterwards.

## 11. Decision log

| # | Decision | By | Status |
|---|---|---|---|
| D1 | Build the Incident & Report Desk | attendee | decided 2026-11-17 |
| D2 | New app, separate from `water-leak-watch` | attendee | decided 2026-11-17 |
| D3 | v1 extras: suggested status and regulator-notified date; no Genie chat in the app | attendee | decided 2026-11-17 |
| D4 | Chlorine case rule R3 (run of 4 below) | attendee | decided 2026-11-17 |
| D5 | Lifecycle Open → In review → Actioned → Closed, with suggestions R5 | attendee | decided 2026-11-17 |
| D6 | Both summers in the register, 2024-25 marked partial | attendee | decided 2026-11-17 |
| D7 | New Lakebase project `water-incident-desk` | attendee | decided 2026-11-17 |
| D8 | Group major overflows by storm day and wastewater catchment (R7): 439 rows become 53 events | attendee | decided 2026-11-17 |
| D9 | Read leak alerts (R8) and pipe risk (R9) from gold. Checked first: 98% of High-tier mains are old pipe in reactive clay (13% of all mains); the alert flags only Unley DMA 7 | Claude Code (attendee delegated: "you decide") | decided 2026-11-17 |
| D10 | Unify definitions: one concept, one object (5.6); this design wins where they disagree | attendee ("your system design is priority") | decided 2026-11-17 |
| D11 | Keep Lakebase idle suspend at 24 h for the workshop (no cold starts during demos; production would use about 5 min) | Claude Code | decided 2026-11-17 |
| D12 | Genie Code reviews the DE report and comments the gold columns | attendee | decided 2026-11-17 |
| D13 | Retire Genie Code; a Claude Code gold subagent takes its lane (comments only, logic unchanged) | attendee | decided 2026-11-17 |
| D14 | Gold column comments: blocked, because the build identity has no permission on the attendee's pipeline. Options: the attendee grants CAN_MANAGE on the pipeline (and edit on its source), or pastes the drafted comments from `docs/gold-report.md` | attendee | open |
| D15 | Pipe risk on breaks: keep gold's tier, labelled "includes this break" (current), or ask gold for a pre-break tier (logic change) | attendee | open |

**Assumptions.**
- **A1:** the data is synthetic, so every status starts as a suggestion.
- **A2:** one notice covers its DMA for one summer.
- **A3:** the regulators are SA Health for drinking water and EPA SA for overflows. This is a domain assumption, not data.
- **A4:** the leak-loss figure is an estimate (inflow × NRW points above peer median).

## 12. Known data quirks

- All 12 notices are dated 15 Dec 2025 but describe samples to 31 March. Treat
  `published_on` as the issue date only.
- All 12 overflow reports come from one storm, 27 Sep 2025, and cover 12 of its 35 major
  overflows (Glenelg 10 of 28, Christies Beach 2 of 7).
- Gold's risk tier **counts the break it labels**: without their own breaks, none of the 9 High-tier
  major-break mains would be High (gold report). The desk shows it as "includes this break";
  a pre-break tier would be a logic change for the attendee to decide (D15, open).
- Gold's risk tier measures **likelihood** only. Only 9 of the 43 major breaks are on High-tier mains, and
  11 are on Low-tier mains: a break counts as major because of how many customers the main serves,
  which the score does not include.
- 75 samples show E. coli at low levels (max 4 cfu/100 mL), with no pattern by distance or
  season. They are out of scope for v1. A real utility would treat each one as notifiable.
- Each PDF holds a fact that is in no table, for example a booster chlorinator, a beach
  closure or a dispatch delay. That is why the viewer sits beside the record.
