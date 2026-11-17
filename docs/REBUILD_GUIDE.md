# Rebuild guide: Torrens Gulf Water demo in a new Databricks environment

This guide recreates everything in this repo (mock data, medallion pipeline, incident desk views, dashboard, Genie Agents and the Incident & Report Desk app) in a different Databricks workspace. It was written on 2026-11-17, before the original lab workspace (catalog `adllabs_096`) shut down.

Build order matters because each layer reads the one before it:

```
mock data -> pipeline (bronze/silver/gold) -> desk views -> dashboard / Genie Agents / app
```

---

## 0. Do this BEFORE the lab shuts down

The repo holds code and config, **not data**. In the new workspace the source catalog `workshop_demo` will probably not exist, so take these with you:

1. **Mock data (required).** Export the 22 tables in `adllabs_096.water_utilities` to Parquet and download them, or write them to cloud storage you control. For example, in a notebook:

   ```python
   for t in [r.tableName for r in spark.sql("SHOW TABLES IN adllabs_096.water_utilities").collect()]:
       spark.table(f"adllabs_096.water_utilities.{t}").write.mode("overwrite").parquet(
           f"/Volumes/adllabs_096/water_utilities/raw/export/{t}")
   ```

   Then download `/Volumes/adllabs_096/water_utilities/raw/` from Catalog Explorer, or use `databricks fs cp -r` with the CLI. `meter_reads` has 6.8M rows and is the largest table. Don't commit the Parquet to GitHub, because GitHub rejects files over 100 MB.
2. **Report PDFs (required for the app).** Download the 56 PDFs under `/Volumes/adllabs_096/water_utilities/raw/documents/`. The `documents` table and the app's report viewer point to them.
3. **Saved incident statuses (optional).** The app stores status changes in Lakebase (`incident_desk.event_status`, `incident_desk.event_status_history` in project `water-incident-desk`). Export them with `pg_dump` or a `SELECT` if you want to keep that history.
4. **Genie reports (manual).** The six Genie reports (NRW, asset/pipe failure, water quality, supply security, billing, wastewater) can't be exported through the API. Copy their text by hand if you need them.

---

## 1. Prerequisites in the new workspace

* Unity Catalog with a catalog you can create schemas, tables and volumes in. Below it is called `<CATALOG>`.
* Serverless compute for notebooks and pipelines.
* A SQL warehouse (serverless recommended). Note its ID: `<WAREHOUSE_ID>`.
* Lakebase (Postgres) and Databricks Apps enabled, for the app only.
* Your GitHub account linked under Settings > Linked accounts, with the Databricks GitHub app installed on `xxykkzj/databricks_demo`.

## 2. Clone the repo

Workspace > Create > Git folder > `https://github.com/xxykkzj/databricks_demo`. Below the folder path is called `<REPO>`, for example `/Workspace/Users/<you>/databricks_demo`.

## 3. Replace environment-specific values

The files hard-code lab names. Run a find-and-replace across `<REPO>` (except `.git/`) **before** you deploy anything:

| Lab value | Replace with | Where it appears |
| --- | --- | --- |
| `workshop_demo.water_utilities` | `<CATALOG>.water_utilities` | `pipeline/transformations/bronze/*.sql`, `app/.../backend/sql.py`, `app/.../sql/01-05*.sql`, `checks/*.sql`, `data/clone_mock_data.sql` |
| `adllabs_096.water_utilities_medallion` | `<CATALOG>.water_utilities_medallion` | dashboard, `genie/*.json`, app `sql.py` and `sql/*.sql`, `checks/*.sql` |
| `adllabs_096.default` | `<CATALOG>.<DESK_SCHEMA>` (for example `<CATALOG>.incident_desk`) | dashboard, `genie/network_ops.genie.json`, app `sql.py`, `router.py`, `sql/*.sql` |
| `adllabs_096.water_utilities` | `<CATALOG>.water_utilities` | `data/clone_mock_data.sql` |
| `ace3100edf02c9ff` (warehouse ID) | `<WAREHOUSE_ID>` | `app/.../databricks.yml`, `app/.../backend/sql.py` (default), `genie/*.json` |
| `/Users/labuser+106@awsbricks.com/...` | your paths | `pipeline/pipeline_settings.json`, `genie/*.json` |

The docs in `app/water-incident-desk/docs/` and `ARCHITECTURE.md` also mention the old names. They're history, so updating them is optional.

## 4. Load the mock data

```sql
CREATE SCHEMA IF NOT EXISTS <CATALOG>.water_utilities;
CREATE VOLUME IF NOT EXISTS <CATALOG>.water_utilities.raw;
```

* **Option A, the workshop catalog exists in the new workspace:** run `data/clone_mock_data.sql` (after step 3), then copy the PDFs from the workshop volume.
* **Option B, from your Parquet export (the usual case):** upload the Parquet folders and PDFs into `/Volumes/<CATALOG>/water_utilities/raw/`, then, per table:

  ```sql
  CREATE OR REPLACE TABLE <CATALOG>.water_utilities.<table> AS
  SELECT * FROM parquet.`/Volumes/<CATALOG>/water_utilities/raw/export/<table>`;
  ```

  Keep the PDFs under `raw/documents/...` with the same subfolders. Then point the `documents.volume_path` column at the new volume:

  ```sql
  UPDATE <CATALOG>.water_utilities.documents
  SET volume_path = replace(volume_path, '/Volumes/workshop_demo/water_utilities/raw', '/Volumes/<CATALOG>/water_utilities/raw');
  ```

  Check a few `volume_path` values against the old prefix first. The cloned copy still uses the workshop path.

Expected row counts, the same in source and copy (2026-11-17):

| Table | Rows | Table | Rows |
| --- | --- | --- | --- |
| accounts | 200,000 | pumping_daily | 5,448 |
| bills | 1,400,000 | service_regions | 6 |
| district_metered_areas | 240 | sewer_mains | 6,000 |
| dma_flow_daily | 163,440 | sewer_overflows | 809 |
| documents | 56 | storage_daily | 6,810 |
| main_breaks | 17,268 | storages | 10 |
| meter_reads | 6,792,000 | treatment_plants | 9 |
| meters | 200,000 | water_mains | 40,000 |
| plant_daily | 6,129 | water_quality_samples | 23,351 |
| properties | 200,000 | weather_daily | 4,086 |
| property360 | 200,000 | pump_stations | 8 |

## 5. Medallion pipeline (Lakeflow Spark Declarative Pipelines)

1. `CREATE SCHEMA IF NOT EXISTS <CATALOG>.water_utilities_medallion;` The SQL files write to `water_utilities_medallion.<table>` (schema-qualified), so this schema must exist.
2. Create an ETL pipeline (Jobs & Pipelines > Create > ETL pipeline) with the same settings as `pipeline/pipeline_settings.json`:
   * Name: `water_utilities_medallion`
   * Serverless on, channel CURRENT, triggered (not continuous)
   * Catalog `<CATALOG>`, default schema `default` (the files qualify their own schema)
   * Source code: `<REPO>/pipeline/transformations/**`. Editing from the Git folder keeps the pipeline under version control.
3. Run a full refresh. It produces bronze, silver and gold datasets. The four gold materialized views are `gold_dma_nrw_daily`, `gold_main_break_risk`, `gold_customer_billing_quarterly` and `gold_operations_daily`.
4. Validate with the queries in `checks/`:
   * `01_gold_vs_source_reconciliation.sql`: every row should show `matches = true`.
   * `02_leak_alert_calibration.sql`: with the production rule (1.06 / 0.75), there should be 0 false-alert days, and the first alert should be for `DMA-ADS-007` on 2025-07-04.
   * `03_risk_score_length_bias.sql`: the correlation of risk score with length should be about 0, and the breaks per km per year should go High > Medium > Low.

Expected gold row counts: `gold_dma_nrw_daily` 163,440; `gold_main_break_risk` 40,000; `gold_customer_billing_quarterly` 168; `gold_operations_daily` 681.

Business rules are documented in the SQL comments. The key ones:
* `leak_alert`: the 14-day average `mnf_vs_peer_ratio` >= 1.06 **and** the 14-day average NRW excess vs the peer median >= 0.75 pp. The old daily rule is kept as `leak_alert_daily`.
* `risk_score`: breaks per km per year, credibility-weighted toward the cohort rate (prior = 2 breaks at the network rate). `expected_breaks_per_yr` is kept for absolute planning.

## 6. Incident desk views

Create `<CATALOG>.<DESK_SCHEMA>`, then run the app's SQL in this order on the SQL warehouse:

1. `app/water-incident-desk/sql/01_wq_low_chlorine_cases.sql`
2. `02_overflow_storm_members.sql`
3. `03_incident_events.sql` (reads the gold views, so run it after step 5)
4. `04_incident_documents.sql`
5. `05_acceptance_checks.sql` (all checks should pass)

Expected (2026-11-17): `incident_events` 173 rows (major_break 43, overflow_storm 53, low_chlorine 76, leak_alert 1), `incident_documents` 56, `wq_low_chlorine_cases` 76, `overflow_storm_members` 439.

Whoever runs these `CREATE OR REPLACE` statements becomes the views' owner. Decide up front whether that should be you or the app's service principal.

## 7. Dashboard

1. Dashboards > Create > Import dashboard from file, and choose `dashboard/torrens_gulf_water_network_assets_incidents.lvdash.json`. Alternatively, copy it into the workspace with the `.lvdash.json` extension.
2. Set the warehouse to `<WAREHOUSE_ID>`, check that all 5 pages render (Overview, Leak detection, Main break risk, Operations & billing, Incident register), then publish.

## 8. Genie Agents

`genie/` holds exports of Finance, Network Ops and Leak Desk. Each file contains `title`, `description`, `warehouse_id` and `serialized_space`: tables, instructions, example SQL and so on. After step 3, recreate each one through the Genie spaces API, for example with the Python SDK:

```python
import json
from databricks.sdk import WorkspaceClient
w = WorkspaceClient()
for name in ["finance", "network_ops", "leak_desk"]:
    s = json.load(open(f"<REPO>/genie/{name}.genie.json"))
    w.api_client.do("POST", "/api/2.0/genie/spaces", body={
        "title": s["title"],
        "description": s.get("description", ""),
        "warehouse_id": "<WAREHOUSE_ID>",
        "parent_path": "/Workspace/Users/<you>",
        "serialized_space": json.dumps(s["serialized_space"]),
    })
```

If the API is unavailable, create each Genie Agent in the UI with the tables listed in `serialized_space`, then paste in its instructions and example queries. Ask each one a known question to check it works, for example "Which DMA has an active leak alert?" (expected: DMA-ADS-007).

## 9. Incident & Report Desk app

The app (APX: FastAPI + React) is in `app/water-incident-desk/` and deploys as a Declarative Automation Bundle (`databricks.yml`).

1. **Lakebase.** Create a Lakebase project (the lab used `water-incident-desk`, branch `production`, database `databricks-postgres`). Update the `postgres` resource paths in `databricks.yml` if you change any of those names. The app creates its own `incident_desk` schema and tables on first start.
2. **Config.** In `databricks.yml`, set `sql_warehouse.id` to `<WAREHOUSE_ID>`. In `src/water_incident_desk/backend/sql.py`, check the `SRC`, `DESK` and `GOLD` constants (step 3).
3. **Build and deploy**, from `app/water-incident-desk/` with the Databricks CLI:

   ```bash
   apx build                     # builds the UI and backend into .build/
   databricks bundle deploy -t dev
   databricks bundle run water-incident-desk-app -t dev
   ```

   The lab used a wrapper script, `workshop-app-deploy`, which won't exist in the new workspace. Use the plain bundle commands above.
4. **Grants for the app's service principal** (shown on the app's page):
   * `USE CATALOG` on `<CATALOG>`, `USE SCHEMA` and `SELECT` on `water_utilities`, `water_utilities_medallion` and `<DESK_SCHEMA>`
   * `READ VOLUME` on `<CATALOG>.water_utilities.raw`, for the PDFs
   * The warehouse and Lakebase permissions come from the bundle resources (`CAN_USE`, `CAN_CONNECT_AND_CREATE`).
5. **Smoke test:** open the app URL and check that the incident list shows 173 events, a report PDF opens, and a status change persists after a reload.

The app calls models and Genie on behalf of the signed-in user (`user_api_scopes: ai-gateway, genie`). Make sure the users you share it with can access the Genie Agents and the model service the app uses.

## 10. Final checklist

* [ ] The 22 tables match the expected row counts in step 4.
* [ ] The pipeline update succeeds, and all three `checks/` queries pass.
* [ ] The desk views match the step 6 counts, and `05_acceptance_checks.sql` passes.
* [ ] The dashboard renders all 5 pages on the new warehouse.
* [ ] The 3 Genie Agents answer a known question correctly.
* [ ] The app loads 173 incidents, opens PDFs and saves statuses.
* [ ] No `adllabs_096` or `workshop_demo` references are left: `grep -rn "adllabs_096\|workshop_demo" <REPO> --exclude-dir=.git`. Matches in docs are fine.
