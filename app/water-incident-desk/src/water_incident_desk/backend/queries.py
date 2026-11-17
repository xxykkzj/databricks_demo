"""The SQL behind every panel. Shown in the UI via 'Show the query'."""

from .sql import DESK, GOLD, SRC

DATA_WINDOW = f"""SELECT CAST(min(obs_date) AS STRING) AS data_from,
       CAST(max(obs_date) AS STRING) AS data_to
FROM {SRC}.dma_flow_daily"""

EVENTS = f"""SELECT event_type, event_id, CAST(event_date AS STRING) AS event_date, title,
       region_id, region_name, dma_id, dma_name, plant_id, plant_name, asset_id, asset_risk_tier,
       impact_value, impact_unit, doc_id, doc_path, docs_on_file, docs_expected, report_on_file,
       regulator, suggested_status, suggested_reason
FROM {DESK}.incident_events
ORDER BY event_date DESC, event_type, event_id"""

BREAK_FACTS = f"""SELECT b.failure_type, b.pipe_material, b.soil_type, b.hot_dry_day, b.probable_cause,
       b.customers_affected, b.repair_hours, b.repair_cost_aud, b.work_order_id,
       m.install_year, m.diameter_mm, m.length_m, m.depth_m, m.is_trunk,
       g.risk_tier, g.risk_pct_rank, g.breaks_total
FROM {SRC}.main_breaks b
JOIN {SRC}.water_mains m ON m.main_id = b.main_id
LEFT JOIN {GOLD}.gold_main_break_risk g ON g.main_id = b.main_id
WHERE b.break_id = :event_id"""

STORM_FACTS = f"""SELECT count(*) AS overflows, count(m.doc_id) AS reports,
       round(sum(m.volume_kl), 1) AS volume_kl, round(max(m.rainfall_mm), 1) AS rainfall_mm,
       round(max(m.duration_hours), 1) AS longest_hours,
       sum(CASE WHEN s.install_year < 1975 AND s.has_ii_defect THEN 1 ELSE 0 END) AS old_defective_mains,
       concat_ws(', ', array_sort(collect_set(m.receiving_water))) AS receiving_waters
FROM {DESK}.overflow_storm_members m
JOIN {SRC}.sewer_mains s ON s.sewer_main_id = m.sewer_main_id
WHERE m.storm_id = :event_id"""

STORM_ITEMS = f"""SELECT m.overflow_id, m.sewer_main_id, m.volume_kl, m.duration_hours, m.receiving_water,
       s.install_year, s.material, s.has_ii_defect, m.doc_id, m.doc_path
FROM {DESK}.overflow_storm_members m
JOIN {SRC}.sewer_mains s ON s.sewer_main_id = m.sewer_main_id
WHERE m.storm_id = :event_id
ORDER BY m.doc_id IS NULL, m.volume_kl DESC"""

CHLORINE_FACTS = f"""SELECT c.season, c.season_partial, CAST(c.opened_on AS STRING) AS opened_on,
       c.season_samples, c.samples_below, c.min_chlorine_mg_l,
       CAST(c.closure_test_met_on AS STRING) AS closure_test_met_on,
       CAST(c.notice_published_on AS STRING) AS notice_published_on,
       d.distance_from_plant_km
FROM {DESK}.wq_low_chlorine_cases c
JOIN {SRC}.district_metered_areas d ON d.dma_id = c.dma_id
WHERE c.case_id = :event_id"""

CHLORINE_SERIES = f"""SELECT CAST(w.sampled_on AS STRING) AS day, w.free_chlorine_mg_l AS value,
       CAST(NULL AS DOUBLE) AS reference
FROM {DESK}.wq_low_chlorine_cases c
JOIN {SRC}.water_quality_samples w
  ON w.dma_id = c.dma_id
 AND w.sampled_on BETWEEN date_sub(c.season_start, 28)
                      AND date_add(coalesce(c.closure_test_met_on, c.season_end), 28)
WHERE c.case_id = :event_id
ORDER BY w.sampled_on"""

LEAK_FACTS = f"""SELECT sum(CASE WHEN leak_alert THEN 1 ELSE 0 END) AS alert_days,
       CAST(max(CASE WHEN leak_alert THEN obs_date END) AS STRING) AS last_alert_day,
       round(min_by(min_night_flow_kl_per_hour, obs_date), 2) AS mnf_at_start,
       round(max_by(min_night_flow_kl_per_hour, obs_date), 2) AS mnf_now,
       round(max_by(mnf_vs_peer_ratio_14d, obs_date), 2) AS mnf_vs_peer_now,
       round(max_by(nrw_pct_28d_avg, obs_date), 1) AS nrw_28d_now,
       round(max_by(peer_median_nrw_pct, obs_date), 1) AS peer_nrw_now
FROM {GOLD}.gold_dma_nrw_daily
WHERE dma_id = split_part(:event_id, ':', 1)
  AND obs_date >= to_date(split_part(:event_id, ':', 2))"""

LEAK_SERIES = f"""SELECT CAST(CAST(date_trunc('WEEK', obs_date) AS DATE) AS STRING) AS day,
       round(avg(nrw_pct), 2) AS value, round(avg(peer_median_nrw_pct), 2) AS reference
FROM {GOLD}.gold_dma_nrw_daily
WHERE dma_id = split_part(:event_id, ':', 1)
  AND obs_date >= date_sub(to_date(split_part(:event_id, ':', 2)), 120)
GROUP BY 1
ORDER BY 1"""

DOCUMENTS = f"""SELECT doc_id, doc_type, title, CAST(published_on AS STRING) AS published_on,
       doc_path, file_name, event_type, event_id
FROM {DESK}.incident_documents"""
