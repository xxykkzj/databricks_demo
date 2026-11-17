# DE report: Incident & Report Desk data layer

> **Current state is v2 (T7–T9), in the last section.** It supersedes v1's contract (now 22
> columns, 173 events), file numbers (`sql/01`–`05`) and checks (C1–C9). Sections 1–8 are the v1 record.

Run on 2026-11-17 by the data engineering subagent with profile `DEFAULT` and warehouse
`ace3100edf02c9ff`. Covers tasks T1, T2, T3, T4 and T6. **T5 is pending** until Claude Code
sends the app's `service_principal_client_id`. Source data is `workshop_demo.water_utilities`,
which is synthetic and read in place. Nothing was created, written or granted in `workshop_demo`.

## 1. Objects created

| Object | Kind | Notes |
|---|---|---|
| `adllabs_096.default.wq_low_chlorine_cases` | view | from `sql/01`, 13 columns, 76 rows |
| `adllabs_096.default.incident_events` | view | from `sql/02`, 19 columns, 558 rows; **the contract** |
| `adllabs_096.default.incident_documents` | view | from `sql/03`, 12 columns, 56 rows |
| `projects/water-incident-desk` | Lakebase autoscaling project | "Water Incident Desk", Postgres 17, with its default branch, endpoint and database |

- **Owner:** all three views are owned by the build identity `910ba35b-cd37-465e-9e6a-bb0af5aa684a`.
- **Lakebase:** no schema, role or table was created in Postgres, and I never connected to it.
  The app's service principal will create and own `incident_desk`.

**Files changed.** `sql/01`–`03` now carry a column list with a COMMENT on every column, inserted
right after the `CREATE OR REPLACE VIEW` line. A script verified that each query body is
byte-identical to the original file, which is the tested logic. The only other edit is in `sql/01`'s view comment, where
`notices'' own` became `notices\' own` (see surprise 1). No other project file was touched.

## 2. T1: views and comments

| Check | Expected | Actual | Pass |
|---|---|---|---|
| `SHOW VIEWS IN adllabs_096.default` | 3 views | `incident_documents`, `incident_events`, `wq_low_chlorine_cases` | yes |
| Columns with a comment | all | 13/13, 19/19, 12/12 | yes |
| `incident_events` names, order, types | contract in ARCHITECTURE 5.2 | identical: 19 columns; `event_date` DATE, `impact_value` DOUBLE, `report_on_file` BOOLEAN, the rest STRING | yes |
| View COMMENTs | text as written in each file | stored text equals file text for all 3 | yes |
| Attendee can query (`databricks-me`) | succeeds | as `labuser+106@awsbricks.com`: 76 / 558 / 56 rows | yes |

The column comments use the meanings in ARCHITECTURE 5.2 and the source tables' own column
comments. The column list form (`CREATE VIEW v (col COMMENT '…', …) COMMENT '…' AS …`) worked on
this warehouse, so `COMMENT ON COLUMN` was not needed. Because the comments live in the same
statement as the view, re-running a file keeps them.

## 3. T2: acceptance checks (`sql/04` C1–C6)

| # | Expected | Actual | Pass |
|---|---|---|---|
| C1 | low_chlorine 76 / 12 / 0 · major_break 43 / 25 / 0 · major_overflow 439 / 12 / 0 | low_chlorine 76 / 12 / 0 · major_break 43 / 25 / 0 · major_overflow 439 / 12 / 0 | yes |
| C2 | low_chlorine Closed 12, Open 64 · major_break In review 25, Open 18 · major_overflow In review 12, Open 427 · no Actioned | same, and no Actioned rows | yes |
| C3 | (none) 7 · low_chlorine 12 · major_break 25 · major_overflow 12 · orphan_links 0 | same, orphan_links 0 in every row | yes |
| C4 | 2024-25 partial=true 37 cases, 0 notices, 37 closure_met · 2025-26 partial=false 39 cases, 12 notices, 39 closure_met, notices close 2026-04-22 to 2026-04-28 | same | yes |
| C5 | every 2025-26 case DMA more than 25 km from its plant, min about 25.7 | min 25.7 km, max 43.5 km, 39 cases | yes |
| C6 | `WM028204-20260501` major_break, 1186, In review (report 2026-05-01) | 1186.0, In review, "Incident report on file, issued 2026-05-01"; title "Burst on DICL main WM028204, Mitcham DMA 80" | yes |
| C6 | `SWM000344-20250927-W` major_overflow, 13782.2 kL, In review (report 2025-09-27) | 13782.2, In review, "Overflow report on file, issued 2025-09-27" | yes |
| C6 | `DMA-EYY-003:summer-2025-26` low_chlorine, 0.32, Closed (closure test met 2026-04-27) | 0.32, Closed, "Closure test met on 2026-04-27: 4 weekly samples at or above 0.5 mg/L" | yes |
| C6 | `DMA-EYY-003:summer-2024-25` low_chlorine, 0.33, Open (notice due; recovered) | 0.33, Open, "Notice due: no water quality notice on file; chlorine recovered by 2025-04-28" | yes |

Extra checks, not in `sql/04` (all pass):
- `event_id` is unique across all 558 events, not just within each `event_type`.
- `incident_documents` has 56 distinct `doc_id`s and 56 distinct paths, all under `/Volumes/workshop_demo/water_utilities/raw/documents/` and ending `.pdf`.
- Event date ranges, useful for the trend chart:

  | event_type | First event | Last event |
  |---|---|---|
  | low_chlorine | 2025-01-01 | 2026-02-10 |
  | major_break | 2025-01-09 | 2026-11-09 |
  | major_overflow | 2025-03-08 | 2026-09-25 |

- Water quality samples run from 2025-01-01 to 2026-11-12.

## 4. T3: volume listing (C7)

| Folder | Files |
|---|---|
| `guide` | 1 |
| `incident_report` | 25 |
| `pumping_memo` | 6 |
| `sewer_overflow_report` | 12 |
| `water_quality_notice` | 12 |
| **Total** | **56** |

Result: **pass**.
- The top level of `raw/documents/` holds only these 5 folders.
- All 56 `doc_path`s in `incident_documents` exist as files. No path is missing, and every file has a `documents` row, so the Documents tab has no "unlinked" files today.
- There are no directories inside the folders and no zero-byte files. Sizes run from 22,061 to 158,853 bytes, and every file was last modified on 2026-11-13.
- The 49 non-null `doc_path`s in `incident_events` all exist.

## 5. T4: Lakebase

| Value | |
|---|---|
| Project | `projects/water-incident-desk` (display name "Water Incident Desk", Postgres 17) |
| **Branch resource path** | `projects/water-incident-desk/branches/production` (default branch, READY, not protected) |
| **Database resource path** | `projects/water-incident-desk/branches/production/databases/databricks-postgres` |
| **Endpoint resource path** | `projects/water-incident-desk/branches/production/endpoints/primary` (READ_WRITE, ACTIVE) |
| **Postgres database name** | `databricks_postgres` |
| Host | `ep-proud-glitter-d6659tqz.database.ap-southeast-2.cloud.databricks.com` (pooler: `ep-proud-glitter-d6659tqz-pooler.database.ap-southeast-2.cloud.databricks.com`) |
| Compute | 1 CU min and max, suspend timeout `86400s` (see surprise 2) |
| Owner | build identity `910ba35b-…`; the database's owner role is `…/roles/sp-910ba35b-cd37-465e-9e6a-bb0af5aa684a` |

- **Attendee access:** `workshop-grant-me database-project` handed the attendee `CAN_MANAGE` on
  `water-incident-desk`. A `databricks-me postgres get-project` call then succeeded, so the grant is in effect.
- **Existing project:** `omnigent-346063b8690e-5976521b840d` was listed but not used or changed.
- **For `databricks.yml`:** the `postgres` resource takes the **resource paths**: `branch` = the branch
  path above and `database` = `…/databases/databricks-postgres`, with a hyphen. `PGDATABASE`
  is `databricks_postgres`, with an underscore.

## 6. Surprises

1. **On this warehouse, `''` does not escape a quote.** `'notices'' own'` is read as two adjacent
   literals, so the stored text becomes "notices own". File 01's view comment would have lost its
   apostrophe, so I changed it to `\'`. The stored comment now matches the file's intended text.
   Use `\'` in any other SQL literal.
2. **The Lakebase compute suspends after 24 hours idle, not 5 minutes.** The new endpoint has
   `suspend_timeout_duration = 86400s`. The Lakebase skill describes a 5-minute default, and
   ARCHITECTURE section 6 says "scale-to-zero (D7)". I left it unchanged because it trades cost
   against wake-up latency, which is a decision. This command would set 5 minutes (not run):
   `databricks postgres update-endpoint projects/water-incident-desk/branches/production/endpoints/primary spec.suspend_timeout_duration --json '{"spec": {"suspend_timeout_duration": "300s"}}'`
3. **The database resource ID is hyphenated:** `databricks-postgres`. The Postgres name is
   `databricks_postgres`. Mixing them up is a common cause of a failed deploy.
4. **Most chlorine cases open on the first sample of their summer.** That is 70 of 76: 35 of 39 in
   2025-26 and 35 of 37 in 2024-25, where that first sample is the data start, 1 Jan 2025.
   - In 2025-26 this is **not** clipping by the 1 December boundary. None of those 35 DMAs had a
     below-target sample in the 8 weeks before 1 Dec. Chlorine steps down exactly as summer starts,
     which looks like a synthetic pattern (illustrative).
   - So the Genie One question "How long after opening did each chlorine case pass its closure
     test?" mostly measures from the start of summer.
5. **Every chlorine case passes its closure test**, all 76 of them. So R5 never suggests
   "Actioned", as C2 expects.
   - The 64 "Open" chlorine cases are open only because no notice is on file. Their reason text
     says that chlorine recovered.
   - The status badge alone could read as "still unsafe", so show `suggested_reason` beside it.
6. **`account users` already hold USE SCHEMA and SELECT on `adllabs_096.default`**, granted
   directly on the schema. That is more than section 4 records, which lists USE CATALOG and
   SELECT on the catalog only.
   - The new app's service principal should be able to read the views with no extra grant.
   - T5 still needs to prove it as the actual service principal.
7. **`adllabs_096.default` also holds a pipeline event-log table**,
   `event_log_cc41ddf7_64d5_4698_bdfe_78f80eb9591c`. `information_schema` shows it but
   `SHOW TABLES` doesn't. It isn't mine and I didn't touch it.

## 7. Open questions for Claude Code

- Should the endpoint suspend timeout be set to `300s` to match the scale-to-zero design? (surprise 2)
- T5 is waiting for the app's `service_principal_client_id`.

## 8. Re-running

Superseded by v2 (see "v2.6 Re-running" below): the files were renumbered and the checks rewritten.


## v2: storm events, gold leak alerts and pipe risk (T7–T9)

Run on 2026-11-17 from 00:54 to 01:00 UTC. I used profile `DEFAULT` and warehouse
`ace3100edf02c9ff`, against ARCHITECTURE v2 (sections 5.1–5.6 and 9).
- Nothing was written to `workshop_demo` or to `adllabs_096.water_utilities_medallion`, which I only read.
- **T5 is still pending.**

### v2.1 Objects and files

| Object in `adllabs_096.default` | Change | Rows |
|---|---|---|
| `overflow_storm_members` | **new** view from `sql/02`, 13 columns | 439 (53 storms) |
| `incident_events` | **replaced** with the v2 contract from `sql/03`, 22 columns | 173 |
| `incident_documents` | **replaced** from `sql/04`, 12 columns | 56 |
| `wq_low_chlorine_cases` | re-run unchanged from `sql/01` | 76 |

- **Ownership restored.** Genie Code's parallel T1–T4 run at 00:50 had made the attendee the owner
  of `wq_low_chlorine_cases`. Its logic was unchanged; only the inline SQL comments were stripped.
  Re-running `sql/01` as the build identity at 00:59 restored ownership. All 4 desk views are now
  owned by `910ba35b-cd37-465e-9e6a-bb0af5aa684a`.
- **Renames (`git mv`):** `02_incident_events` → `03`, `03_incident_documents` → `04`, and
  `04_acceptance_checks` → `05`. The renames landed in commit `cfe20c2`.
- **New and rewritten files:**
  - `sql/02` is new.
  - `sql/03` and `sql/04` carry the v2 bodies.
  - `sql/05` holds C1–C9.
  - `sql/01` is unchanged.
- **Bodies:** copied from `sql/v2-tested/`, with only `__MEMBERS__` replaced. A script confirmed
  that each one is identical to its draft. Then I ran `git rm -r sql/v2-tested`, as Claude Code authorised.
- **View comments:**
  - `overflow_storm_members` has new text.
  - The texts for `incident_events` and `incident_documents` now describe v2: 4 event types,
    report coverage and the gold sources.
  - No comment contains a quote character.

### v2.2 T7 checks

| Check | Expected | Actual | Pass |
|---|---|---|---|
| `SHOW VIEWS` | 4 desk views | `incident_documents`, `incident_events`, `overflow_storm_members`, `wq_low_chlorine_cases` | yes |
| Column-list order | the same as each body's output (a list renames by position) | `DESCRIBE QUERY` of each body matches its list: 13, 22 and 12 columns | yes |
| `incident_events` | the v2 contract's names, order and types | identical: 22 columns. `event_date` DATE, `impact_value` DOUBLE, `docs_on_file` and `docs_expected` INT, `report_on_file` BOOLEAN, the rest STRING | yes |
| Comments | every column, and no `''` | 0 uncommented columns across the 4 views, and no quote characters | yes |
| View COMMENT | stored text = file text | all 4 | yes |
| Owner | build identity | all 4 | yes |
| Attendee read (`databricks-me`) | succeeds | 76 / 439 / 173 / 56 rows | yes |

### v2.3 T8: acceptance checks (`sql/05`, C1–C9)

I ran the suite twice. The final run, at 01:00 after the ownership re-run, is identical to the first clean run.

| # | Expected (5.4) | Actual | Pass |
|---|---|---|---|
| C1 | leak_alert 1, docs 0/0 · low_chlorine 76, docs 12/76 · major_break 43, docs 25/43 · overflow_storm 53, docs 12/439, 0 fully reported · 0 duplicate `event_id`s · 173 in total | same. Fully reported: chlorine 12, breaks 25. Total row: 173 events, 49 of 558 docs, 37 fully reported, 0 duplicates | yes |
| C2 | leak Open 1 · chlorine Closed 12, Open 64 · break In review 25, Open 18 · storm Open 53 | same, and no Actioned rows | yes |
| C3 | (none) 7 · low_chlorine 12 · major_break 25 · overflow_storm 12 · 0 orphan links | same | yes |
| C4 | 2024-25: 37 cases, partial · 2025-26: 39 cases, 12 notices, notices close 2026-04-22 to 2026-04-28 | same. Also as in v1: 0 notices and 37 closure_met in 2024-25, 39 closure_met in 2025-26 | yes |
| C5 | every 2025-26 case DMA more than 25 km from its plant | min 25.7 km, max 43.5 km, 39 cases | yes |
| C6 | `WM028204-20260501`: 1186 customers, In review | 1186.0, In review | yes |
| C6 | `WWTP-GLE:2025-09-27`: 355,753.6 kL, docs 10/28, Open | 355753.6, 10/28, Open, "Reports due: 10 of 28 overflow reports on file" | yes |
| C6 | `DMA-EYY-003:summer-2025-26`: Closed | Closed, closure test met 2026-04-27 | yes |
| C6 | `DMA-ADS-007:2025-07-04`: leak, 20.2 ML, Open, 497 days | 20.2 ML, Open. Both day counts are 497: the one in the title and the days from start to gold's last day | yes |
| C7 | High 9 · Medium 23 · Low 11, all 43 with a tier | same, and no other event type has a tier | yes |
| C8 | 439 rows · 53 distinct `storm_id`s · 12 with a report | same, and 0 duplicate `overflow_id`s | yes |
| C9 | all 56 `doc_path`s exist | 56 of 56, with 56 files in the volume | yes |

- **C9 is now SQL.** It uses `read_files(… format => 'binaryFile')` over `raw/documents/`, so the
  whole suite runs from one file. The raw volume holds only `documents/` (5 folders, 56 PDFs), so
  the app's `raw/**` listing finds the same 56 files.
- **C1's first run failed on my SQL, not the data.** An output alias shadowed the grouping column
  (`GROUPING_COLUMN_MISMATCH`). Renaming the output column to `type_or_total` fixed it. No rule
  and no expected value changed.

### v2.4 Surprises and notes

1. **Genie Code's 00:50 run did not touch the Lakebase project.** It still has 1 branch, 1 database
   and 1 endpoint, with the suspend timeout at `86400s` (D11). The only other project is `omnigent-…`.
2. **Only 2 of the 53 storms have any report:** Glenelg 10 of 28 and Christies Beach 2 of 7, both
   on 27 Sep 2025. So no storm is fully reported, and all 53 are Open. The storms span 33 days and
   4 plants, with 1 to 28 overflows each.
3. **Every one of the 439 major overflows is wet-weather inflow and infiltration**, on days with
   18.9 to 49.6 mm of rain. So "storm" fits every `overflow_storm` event, and no blockage is grouped as a storm.
4. **Gold is clean for the desk's use.**
   - `gold_dma_nrw_daily` has 240 DMAs × 681 days (2025-01-01 to 2026-11-12) with no gaps and no
     null `leak_alert`. So grouping by rows gives exactly the runs of consecutive days that R8 asks for.
   - `gold_main_break_risk` has one row per main (40,000): High 2,000, Medium 6,000 and Low 32,000,
     that is 5 / 15 / 80 percent.
5. **The 32 uncommented gold columns include all 4 that the desk reads:** `leak_alert`,
   `nrw_excess_vs_peer_pp`, `mnf_vs_peer_ratio_14d` and `risk_tier`. Commenting them is the gold
   subagent's item (D12, handed over from Genie Code in D13). The desk's column comments name these gold columns but don't restate gold's rules (5.6).
6. **The leak's `suggested_reason` ends with "no investigation recorded".** The view cannot see
   Lakebase, so this text stays after someone saves a status. Show it only while the status is still the suggestion.
7. **The gold objects are materialized views owned by the attendee's pipeline (`cc41ddf7…`).** The
   event-log table in `default` (v1 surprise 7) belongs to that pipeline.

### v2.5 For T5

- The app reads all 4 desk views, including `overflow_storm_members` for the storm detail. T5
  should check SELECT on each of them as the app's service principal.
- `incident_events` reads gold with the rights of its owner, the build identity. So the service
  principal should need no grant on the medallion schema; T5 will prove it.
- `account users` already hold USE SCHEMA and SELECT on `adllabs_096.default`.

### v2.6 Re-running

Run `sql/01`, `02`, `03` and `04` in that order, each with its leading `--` header lines stripped.
Then run the 9 statements in `sql/05`. The scratch helpers are in `/tmp/de_work`, outside the project.
