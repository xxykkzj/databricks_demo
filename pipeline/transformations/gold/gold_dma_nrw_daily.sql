-- Leak detection and non-revenue water per DMA per day.
-- mnf_ratio compares the day's minimum night flow with the DMA's trailing 28-day average (onset signal).
-- leak_alert is peer-based and smoothed over 14 days, so slow-ramping leaks are caught early
-- and daily noise does not trigger it:
--   14-day avg of (MNF per 1,000 connections / all-DMA median that day) >= 1.06
--   AND 14-day avg of (nrw_pct - all-DMA median nrw_pct that day) >= 0.75 percentage points
--   AND a full 14-day window exists.
-- Calibrated on 2025-2026 data: healthy DMAs never meet both conditions; the DMA-ADS-007 leak
-- (onset ~2025-06-23) alerts from 2025-07-04. leak_alert_daily keeps the stricter unsmoothed rule.
CREATE OR REFRESH MATERIALIZED VIEW water_utilities_medallion.gold_dma_nrw_daily
COMMENT 'Gold: daily non-revenue water, minimum night flow vs 28-day baseline, leak alert flag, main breaks and weather per DMA.'
CLUSTER BY (dma_id, obs_date)
AS
WITH peer AS (
  SELECT f.obs_date,
    MEDIAN(f.min_night_flow_kl_per_hour * 1000.0 / d.connections) AS peer_median_mnf_per_1000_conn,
    MEDIAN(f.nrw_pct) AS peer_median_nrw_pct
  FROM water_utilities_medallion.silver_dma_flow_daily f
  JOIN water_utilities_medallion.silver_dim_dma d ON f.dma_id = d.dma_id
  GROUP BY f.obs_date
),
breaks AS (
  SELECT dma_id, failed_on AS obs_date,
         COUNT(*) AS main_breaks,
         COUNT_IF(is_major) AS major_main_breaks
  FROM water_utilities_medallion.silver_main_breaks
  GROUP BY dma_id, failed_on
),
flow AS (
  SELECT f.*,
    AVG(f.min_night_flow_kl_per_hour) OVER (
      PARTITION BY f.dma_id ORDER BY f.obs_date ROWS BETWEEN 28 PRECEDING AND 1 PRECEDING) AS mnf_baseline_28d,
    COUNT(f.min_night_flow_kl_per_hour) OVER (
      PARTITION BY f.dma_id ORDER BY f.obs_date ROWS BETWEEN 28 PRECEDING AND 1 PRECEDING) AS baseline_days,
    AVG(f.nrw_pct) OVER (
      PARTITION BY f.dma_id ORDER BY f.obs_date ROWS BETWEEN 27 PRECEDING AND CURRENT ROW) AS nrw_pct_28d_avg
  FROM water_utilities_medallion.silver_dma_flow_daily f
),
daily AS (
SELECT
  f.dma_id,
  d.dma_name,
  d.region_id,
  d.region_name,
  d.pressure_zone,
  d.dominant_soil,
  f.obs_date,
  f.inflow_ml,
  f.billed_ml,
  f.nrw_ml,
  f.nrw_pct,
  f.nrw_pct_28d_avg,
  f.min_night_flow_kl_per_hour,
  f.mnf_baseline_28d,
  f.min_night_flow_kl_per_hour / NULLIF(f.mnf_baseline_28d, 0) AS mnf_ratio,
  f.min_night_flow_kl_per_hour * 1000.0 / NULLIF(d.connections, 0) AS mnf_per_1000_conn,
  p.peer_median_mnf_per_1000_conn,
  p.peer_median_nrw_pct,
  (f.min_night_flow_kl_per_hour * 1000.0 / NULLIF(d.connections, 0)) / NULLIF(p.peer_median_mnf_per_1000_conn, 0) AS mnf_vs_peer_ratio,
  COALESCE(
    (f.min_night_flow_kl_per_hour * 1000.0 / NULLIF(d.connections, 0)) >= 1.25 * p.peer_median_mnf_per_1000_conn
    AND f.nrw_pct >= 1.25 * p.peer_median_nrw_pct, false) AS leak_alert_daily,
  f.nrw_pct - p.peer_median_nrw_pct AS nrw_excess_vs_peer_pp,
  COALESCE(b.main_breaks, 0) AS main_breaks,
  COALESCE(b.major_main_breaks, 0) AS major_main_breaks,
  f.rainfall_mm,
  f.max_temp_c,
  f.hot_dry_day
FROM flow f
JOIN water_utilities_medallion.silver_dim_dma d ON f.dma_id = d.dma_id
JOIN peer p ON f.obs_date = p.obs_date
LEFT JOIN breaks b ON f.dma_id = b.dma_id AND f.obs_date = b.obs_date
),
smoothed AS (
  SELECT daily.*,
    AVG(mnf_vs_peer_ratio) OVER w14 AS mnf_vs_peer_ratio_14d,
    AVG(nrw_excess_vs_peer_pp) OVER w14 AS nrw_excess_vs_peer_pp_14d,
    COUNT(*) OVER w14 AS smoothing_days
  FROM daily
  WINDOW w14 AS (PARTITION BY dma_id ORDER BY obs_date ROWS BETWEEN 13 PRECEDING AND CURRENT ROW)
)
SELECT
  * EXCEPT (smoothing_days),
  COALESCE(smoothing_days = 14 AND mnf_vs_peer_ratio_14d >= 1.06 AND nrw_excess_vs_peer_pp_14d >= 0.75, false) AS leak_alert
FROM smoothed;
