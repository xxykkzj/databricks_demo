-- Owner: data engineering subagent. Run after 01-04. v2 checks C1-C9 from ARCHITECTURE 5.4.
-- Every result must match the expected values below. If one differs, do not "fix" the rule:
-- record it in docs/de-report.md and ask.

-- C1. Events, reports and duplicate keys, by type and in total.
-- Expected: leak_alert 1, docs 0/0 · low_chlorine 76, docs 12/76 · major_break 43, docs 25/43 ·
--           overflow_storm 53, docs 12/439, 0 fully reported · 0 duplicate event_ids · 173 in total
--           (fully_reported for low_chlorine and major_break equals their docs_on_file: 12 and 25)
SELECT CASE WHEN grouping(event_type) = 1 THEN '(total)' ELSE event_type END AS type_or_total,
       count(*) AS events,
       sum(docs_on_file) AS docs_on_file, sum(docs_expected) AS docs_expected,
       sum(CAST(report_on_file AS INT)) AS fully_reported,
       count(*) - count(DISTINCT event_id) AS duplicate_ids
FROM adllabs_096.default.incident_events
GROUP BY GROUPING SETS ((event_type), ())
ORDER BY grouping(event_type), event_type;

-- C2. Suggested status mix.
-- Expected: leak_alert Open 1 · low_chlorine Closed 12, Open 64 · major_break In review 25, Open 18 ·
--           overflow_storm Open 53 · no Actioned rows
SELECT event_type, suggested_status, count(*) AS n
FROM adllabs_096.default.incident_events
GROUP BY event_type, suggested_status ORDER BY event_type, suggested_status;

-- C3. Every PDF link points at a real event.
-- Expected: (none) 7 · low_chlorine 12 · major_break 25 · overflow_storm 12; orphan_links 0 everywhere
SELECT coalesce(d.event_type, '(none)') AS event_type, count(*) AS docs,
       sum(CASE WHEN d.event_type IS NOT NULL AND e.event_id IS NULL THEN 1 ELSE 0 END) AS orphan_links
FROM adllabs_096.default.incident_documents d
LEFT JOIN adllabs_096.default.incident_events e
  ON e.event_type = d.event_type AND e.event_id = d.event_id
GROUP BY 1 ORDER BY 1;

-- C4. Chlorine cases by summer, and the closure dates of the notices (view 01 is unchanged).
-- Expected: summer 2024-25 partial=true 37 cases, 0 notices, 37 closure_met ·
--           summer 2025-26 partial=false 39 cases, 12 notices, 39 closure_met, notices close 2026-04-22 to 2026-04-28
SELECT season, season_partial, count(*) AS cases, count(notice_doc_id) AS notices,
       count(closure_test_met_on) AS closure_met,
       min(CASE WHEN notice_doc_id IS NOT NULL THEN closure_test_met_on END) AS notice_close_from,
       max(CASE WHEN notice_doc_id IS NOT NULL THEN closure_test_met_on END) AS notice_close_to
FROM adllabs_096.default.wq_low_chlorine_cases
GROUP BY season, season_partial ORDER BY season;

-- C5. The chlorine rule picks the far network only (unchanged).
-- Expected: every summer 2025-26 case DMA is more than 25 km from its plant (min about 25.7 km, 39 cases)
SELECT min(d.distance_from_plant_km) AS min_km, max(d.distance_from_plant_km) AS max_km, count(*) AS cases
FROM adllabs_096.default.wq_low_chlorine_cases c
JOIN workshop_demo.water_utilities.district_metered_areas d ON d.dma_id = c.dma_id
WHERE c.season = 'summer 2025-26';

-- C6. Spot checks: four known events.
-- Expected:
--   WM028204-20260501           major_break     1186 customers affected        In review
--   WWTP-GLE:2025-09-27         overflow_storm  355,753.6 kL, docs 10/28       Open
--   DMA-EYY-003:summer-2025-26  low_chlorine                                   Closed
--   DMA-ADS-007:2025-07-04      leak_alert      20.2 ML                        Open, 497 days
--   (alert_days is read from the title; days_to_last_day counts days from the start to the
--    last day of gold data, inclusive, so both are 497 when the alert is still on)
SELECT event_type, event_id, event_date, title, impact_value, impact_unit,
       docs_on_file, docs_expected, suggested_status, suggested_reason,
       CASE WHEN event_type = 'leak_alert' THEN CAST(regexp_extract(title, 'for ([0-9]+) days', 1) AS INT) END AS alert_days,
       CASE WHEN event_type = 'leak_alert' THEN datediff((SELECT max(obs_date) FROM adllabs_096.water_utilities_medallion.gold_dma_nrw_daily), event_date) + 1 END AS days_to_last_day
FROM adllabs_096.default.incident_events
WHERE event_id IN ('WM028204-20260501', 'WWTP-GLE:2025-09-27',
                   'DMA-EYY-003:summer-2025-26', 'DMA-ADS-007:2025-07-04')
ORDER BY event_type;

-- C7. Risk tier on major breaks (R9); every other event type has none.
-- Expected: major_break High 9 · Low 11 · Medium 23 (all 43 have a tier) · every other type (none)
SELECT event_type, coalesce(asset_risk_tier, '(none)') AS asset_risk_tier, count(*) AS events
FROM adllabs_096.default.incident_events
GROUP BY 1, 2 ORDER BY 1, 2;

-- C8. overflow_storm_members (R7).
-- Expected: 439 rows · 53 distinct storm_id · 12 with a report · 0 duplicate overflow_ids
SELECT count(*) AS members, count(DISTINCT storm_id) AS storms, count(doc_id) AS with_report,
       count(*) - count(DISTINCT overflow_id) AS duplicate_overflow_ids
FROM adllabs_096.default.overflow_storm_members;

-- C9. Every doc_path in incident_documents exists as a file in the volume (56 files in 5 folders).
-- Expected: doc_paths 56 · found 56 · files_in_volume 56
WITH files AS (
  SELECT regexp_replace(path, '^dbfs:', '') AS path
  FROM read_files('/Volumes/workshop_demo/water_utilities/raw/documents/',
                  format => 'binaryFile', recursiveFileLookup => true)
)
SELECT count(*) AS doc_paths, count(f.path) AS found, (SELECT count(*) FROM files) AS files_in_volume
FROM adllabs_096.default.incident_documents d
LEFT JOIN files f ON f.path = d.doc_path;
