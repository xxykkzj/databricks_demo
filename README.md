# Torrens Gulf Water - Databricks demo

Source for a water-utility analytics demo built on synthetic data (Torrens Gulf Water Corporation, South Australia).

| Folder | Contents | Live workspace asset |
| --- | --- | --- |
| `data/` | SQL to deep-clone the mock data into `adllabs_096.water_utilities` | 22 tables + `raw` volume (56 PDFs) |
| `pipeline/` | Lakeflow Spark Declarative Pipeline SQL (bronze/silver/gold) and exported settings | `water_utilities_medallion` (cc41ddf7-64d5-4698-bdfe-78f80eb9591c) |
| `dashboard/` | AI/BI dashboard export (`.lvdash.json`) | Torrens Gulf Water - Network, Assets & Incidents |
| `genie/` | Genie Agent exports (Finance, Network Ops, Leak Desk) | 3 Genie Agents |
| `app/water-incident-desk/` | Incident & Report Desk app (APX: React + FastAPI), its bundle (`databricks.yml`), architecture docs, SQL views and agent config (`.agents`, `.claude`, `AGENTS.md`) | `water-incident-desk` app |

## Notes

* These are snapshots copied on 2026-11-17. The live assets still run from their original workspace locations and still read `workshop_demo.water_utilities`.
* The six Genie reports (GENIE_DOCUMENT) cannot be exported via API and are not included.
* Data is fully synthetic.
* Workspace Git folder: `/Users/labuser+106@awsbricks.com/databricks_demo`.
