-- Owner: data engineering subagent. Run 3rd. v2 body tested read-only on 2026-11-17 (173 rows).
-- Grain: one row per event. This view is the contract the app and Genie One read (ARCHITECTURE 5.2, v2).
CREATE OR REPLACE VIEW adllabs_096.default.incident_events
(
  event_type       COMMENT 'Kind of event: major_break (water main break with 300 or more customers affected), overflow_storm (every major sewer overflow on one day draining to one wastewater plant), low_chlorine (a DMA-summer low free-chlorine case) or leak_alert (a run of days with the gold leak alert on for a DMA).',
  event_id         COMMENT 'Event key, unique across the register: break_id for major_break, <plant_id>:<date> for overflow_storm, <dma_id>:summer-YYYY-YY for low_chlorine, <dma_id>:<alert start date> for leak_alert. Statuses saved in the app are keyed on (event_type, event_id).',
  event_date       COMMENT 'Date of the event: failure date (major_break), storm day (overflow_storm), date the chlorine case opened (low_chlorine) or first day of the leak alert (leak_alert). South Australian local date.',
  title            COMMENT 'Readable one-line description of the event, for example Burst on DICL main WM028204, Mitcham DMA 80.',
  region_id        COMMENT 'Service region key (ADN, ADS, BMN, EYY, HIL or MRR): the region of the main (major_break), of the wastewater plant (overflow_storm) or of the DMA (low_chlorine, leak_alert). Joins to workshop_demo.water_utilities.service_regions.region_id.',
  region_name      COMMENT 'Service region name, for example Adelaide North or Eyre and Yorke.',
  dma_id           COMMENT 'District metered area (DMA) key, for example DMA-EYY-003. Null for overflow_storm: the sewer network has no DMAs.',
  dma_name         COMMENT 'Readable DMA name, usually the suburb and the DMA number. Null for overflow_storm.',
  plant_id         COMMENT 'Plant key: the wastewater plant the storm overflows drain to (overflow_storm) or the treatment plant that supplies the DMA (low_chlorine, leak_alert). Null for major_break. Joins to workshop_demo.water_utilities.treatment_plants.plant_id.',
  plant_name       COMMENT 'Name of the plant in plant_id. Null for major_break.',
  asset_id         COMMENT 'Water main that failed (main_id) for major_break; joins to workshop_demo.water_utilities.water_mains.main_id. Null for the other event types.',
  asset_risk_tier  COMMENT 'Break risk tier of the failed main for major_break: High, Medium or Low, read from adllabs_096.water_utilities_medallion.gold_main_break_risk.risk_tier. It measures the likelihood of a break only, not how many customers the main serves. Null for the other event types.',
  impact_value     COMMENT 'Size of the event, in impact_unit: customers affected (major_break), total kilolitres spilled by the storm overflows (overflow_storm), lowest free chlorine in mg/L during the summer (low_chlorine, where lower is worse) or estimated megalitres lost above the peer level (leak_alert: the sum over alert days of inflow_ml times nrw_excess_vs_peer_pp floored at 0, divided by 100). Compare values only within one event_type.',
  impact_unit      COMMENT 'Unit of impact_value: customers affected, kL spilled, mg/L lowest free chlorine, or ML lost above peer level (estimate).',
  doc_id           COMMENT 'doc_id of the one PDF linked to the event (incident report for major_break, water quality notice for low_chlorine) in workshop_demo.water_utilities.documents. Null when none is on file, and always null for overflow_storm (its reports are per overflow, in overflow_storm_members) and leak_alert.',
  doc_path         COMMENT 'Full volume path of the PDF in doc_id, under /Volumes/workshop_demo/water_utilities/raw/documents/. Null whenever doc_id is null.',
  docs_on_file     COMMENT 'Reports on file for the event: 0 or 1 for major_break and low_chlorine, the number of storm overflows with a report for overflow_storm, 0 for leak_alert.',
  docs_expected    COMMENT 'Reports due for the event: 1 for major_break and low_chlorine, the number of major overflows in the storm for overflow_storm, 0 for leak_alert (no report is expected).',
  report_on_file   COMMENT 'True when docs_expected is above 0 and every expected report is on file (docs_on_file = docs_expected). Always false for leak_alert.',
  regulator        COMMENT 'Regulator assumed to be notified (an assumption, not data): SA Health for low_chlorine (drinking water), EPA SA for overflow_storm (sewer overflows), null for major_break and leak_alert.',
  suggested_status COMMENT 'Status derived from the data: Open, In review, Actioned or Closed. major_break: In review when its report is on file, otherwise Open. overflow_storm: In review when every overflow is reported, otherwise Open. low_chlorine: Open with no notice on file; Closed when a notice is on file and the closure test is met; Actioned when a notice is on file and the test is not met. leak_alert: Open while the alert is still on at the last day of data, otherwise Closed. A status a person saves in the app lives in Lakebase and overrides this.',
  suggested_reason COMMENT 'Plain-English reason for suggested_status, for example Report due: no incident report on file, or Reports due: 10 of 28 overflow reports on file.'
)
COMMENT 'Incident register: one row per event for the Incident and Report Desk, in 4 event types. major_break is a water main break with 300 or more customers affected (is_major). overflow_storm groups every major sewer overflow (is_major: 5,000 kL or more) on one day draining to one wastewater plant; its overflows are in overflow_storm_members. low_chlorine is a DMA-summer case from wq_low_chlorine_cases. leak_alert is one run of consecutive days with adllabs_096.water_utilities_medallion.gold_dma_nrw_daily.leak_alert true for a DMA; the alert rule belongs to gold. docs_on_file and docs_expected count the reports on file and due, and report_on_file is true when every expected report is on file. asset_risk_tier on breaks is gold_main_break_risk.risk_tier. suggested_status (Open, In review, Actioned, Closed) and suggested_reason are derived from the data; the status a person saves lives in Lakebase, not here. regulator is an assumption: SA Health for drinking water, EPA SA for sewer overflows, none for main breaks and leak alerts. Reads workshop_demo.water_utilities and the gold layer in place. Synthetic data.'
AS
WITH storms AS (                                 -- D8: one event per storm day per wastewater catchment
  SELECT storm_id, plant_id, overflow_on,
         count(*) AS overflows, count(doc_id) AS reports,
         sum(volume_kl) AS volume_kl
  FROM adllabs_096.default.overflow_storm_members
  GROUP BY storm_id, plant_id, overflow_on
),
leak_days AS (                                   -- D9: the leak rule lives in gold; only the episodes are grouped here
  SELECT dma_id, obs_date, leak_alert, inflow_ml, nrw_excess_vs_peer_pp, mnf_vs_peer_ratio_14d,
         row_number() OVER (PARTITION BY dma_id ORDER BY obs_date)
       - row_number() OVER (PARTITION BY dma_id, leak_alert ORDER BY obs_date) AS grp
  FROM adllabs_096.water_utilities_medallion.gold_dma_nrw_daily
),
leaks AS (
  SELECT dma_id, min(obs_date) AS start_on, max(obs_date) AS end_on, count(*) AS alert_days,
         sum(inflow_ml * greatest(nrw_excess_vs_peer_pp, 0) / 100) AS excess_ml,
         max_by(mnf_vs_peer_ratio_14d, obs_date) AS latest_mnf_vs_peer
  FROM leak_days WHERE leak_alert
  GROUP BY dma_id, grp
),
gold_window AS (
  SELECT max(obs_date) AS last_day FROM adllabs_096.water_utilities_medallion.gold_dma_nrw_daily
)
SELECT 'major_break' AS event_type, b.break_id AS event_id, b.failed_on AS event_date,
       concat(initcap(b.failure_type), ' on ', b.pipe_material, ' main ', b.main_id, ', ', dm.dma_name) AS title,
       b.region_id, r.region_name, b.dma_id, dm.dma_name,
       CAST(NULL AS STRING) AS plant_id, CAST(NULL AS STRING) AS plant_name,
       b.main_id AS asset_id, g.risk_tier AS asset_risk_tier,
       CAST(b.customers_affected AS DOUBLE) AS impact_value, 'customers affected' AS impact_unit,
       d.doc_id, d.volume_path AS doc_path,
       CAST(CASE WHEN d.doc_id IS NULL THEN 0 ELSE 1 END AS INT) AS docs_on_file,
       CAST(1 AS INT) AS docs_expected,
       d.doc_id IS NOT NULL AS report_on_file,
       CAST(NULL AS STRING) AS regulator,
       CASE WHEN d.doc_id IS NOT NULL THEN 'In review' ELSE 'Open' END AS suggested_status,
       CASE WHEN d.doc_id IS NOT NULL THEN concat('Incident report on file, issued ', d.published_on)
            ELSE 'Report due: no incident report on file' END AS suggested_reason
FROM workshop_demo.water_utilities.main_breaks b
JOIN workshop_demo.water_utilities.district_metered_areas dm ON dm.dma_id = b.dma_id
JOIN workshop_demo.water_utilities.service_regions r ON r.region_id = b.region_id
LEFT JOIN workshop_demo.water_utilities.documents d ON d.break_id = b.break_id
LEFT JOIN adllabs_096.water_utilities_medallion.gold_main_break_risk g ON g.main_id = b.main_id
WHERE b.is_major
UNION ALL
SELECT 'overflow_storm', s.storm_id, s.overflow_on,
       concat('Storm overflows, ', replace(tp.plant_name, ' Wastewater Treatment Plant', ''), ' catchment: ',
              s.overflows, CASE WHEN s.overflows = 1 THEN ' major overflow, ' ELSE ' major overflows, ' END,
              format_number(s.volume_kl, 0), ' kL'),
       tp.region_id, r.region_name, CAST(NULL AS STRING), CAST(NULL AS STRING),
       s.plant_id, tp.plant_name, CAST(NULL AS STRING), CAST(NULL AS STRING),
       round(s.volume_kl, 1), 'kL spilled',
       CAST(NULL AS STRING), CAST(NULL AS STRING),
       CAST(s.reports AS INT), CAST(s.overflows AS INT), s.reports = s.overflows,
       'EPA SA',
       CASE WHEN s.reports = s.overflows THEN 'In review' ELSE 'Open' END,
       CASE WHEN s.reports = 0 THEN concat('Reports due: none of ', s.overflows, ' overflow reports on file')
            WHEN s.reports < s.overflows THEN concat('Reports due: ', s.reports, ' of ', s.overflows, ' overflow reports on file')
            ELSE concat('All ', s.overflows, ' overflow reports on file') END
FROM storms s
JOIN workshop_demo.water_utilities.treatment_plants tp ON tp.plant_id = s.plant_id
JOIN workshop_demo.water_utilities.service_regions r ON r.region_id = tp.region_id
UNION ALL
SELECT 'low_chlorine', c.case_id, c.opened_on,
       concat('Chlorine below target, ', dm.dma_name, ', ', c.season),
       dm.region_id, r.region_name, c.dma_id, dm.dma_name,
       dm.treatment_plant_id, tp.plant_name, CAST(NULL AS STRING), CAST(NULL AS STRING),
       CAST(c.min_chlorine_mg_l AS DOUBLE), 'mg/L lowest free chlorine',
       c.notice_doc_id, d.volume_path,
       CAST(CASE WHEN c.notice_doc_id IS NULL THEN 0 ELSE 1 END AS INT), CAST(1 AS INT),
       c.notice_doc_id IS NOT NULL,
       'SA Health',
       CASE WHEN c.notice_doc_id IS NULL THEN 'Open'
            WHEN c.closure_test_met_on IS NOT NULL THEN 'Closed'
            ELSE 'Actioned' END,
       CASE WHEN c.notice_doc_id IS NULL THEN concat('Notice due: no water quality notice on file',
                 CASE WHEN c.closure_test_met_on IS NOT NULL THEN concat('; chlorine recovered by ', c.closure_test_met_on) ELSE '' END)
            WHEN c.closure_test_met_on IS NOT NULL THEN concat('Closure test met on ', c.closure_test_met_on, ': 4 weekly samples at or above 0.5 mg/L')
            ELSE 'Notice issued; closure test not met yet' END
FROM adllabs_096.default.wq_low_chlorine_cases c
JOIN workshop_demo.water_utilities.district_metered_areas dm ON dm.dma_id = c.dma_id
JOIN workshop_demo.water_utilities.service_regions r ON r.region_id = dm.region_id
LEFT JOIN workshop_demo.water_utilities.treatment_plants tp ON tp.plant_id = dm.treatment_plant_id
LEFT JOIN workshop_demo.water_utilities.documents d ON d.doc_id = c.notice_doc_id
UNION ALL
SELECT 'leak_alert', concat(l.dma_id, ':', CAST(l.start_on AS STRING)), l.start_on,
       concat('Leak alert, ', dm.dma_name, ': night flow above peer DMAs for ', l.alert_days, ' days'),
       dm.region_id, r.region_name, l.dma_id, dm.dma_name,
       dm.treatment_plant_id, tp.plant_name, CAST(NULL AS STRING), CAST(NULL AS STRING),
       round(l.excess_ml, 1), 'ML lost above peer level (estimate)',
       CAST(NULL AS STRING), CAST(NULL AS STRING), CAST(0 AS INT), CAST(0 AS INT), false,
       CAST(NULL AS STRING),
       CASE WHEN l.end_on = gw.last_day THEN 'Open' ELSE 'Closed' END,
       CASE WHEN l.end_on = gw.last_day
            THEN concat('Leak alert active since ', l.start_on, ': night flow ', format_number(l.latest_mnf_vs_peer, 1),
                        ' times the peer level; no investigation recorded')
            ELSE concat('Leak alert cleared on ', date_add(l.end_on, 1)) END
FROM leaks l
CROSS JOIN gold_window gw
JOIN workshop_demo.water_utilities.district_metered_areas dm ON dm.dma_id = l.dma_id
JOIN workshop_demo.water_utilities.service_regions r ON r.region_id = dm.region_id
LEFT JOIN workshop_demo.water_utilities.treatment_plants tp ON tp.plant_id = dm.treatment_plant_id
