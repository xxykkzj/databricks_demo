-- Leak alert calibration for gold_dma_nrw_daily.leak_alert.
-- Production rule: 14-day mnf_vs_peer_ratio >= 1.06 AND 14-day NRW excess vs peer median >= 0.75 pp.
-- Reference leak: DMA-ADS-007 (onset about 2025-06-23). Every other DMA is treated as healthy.
-- A good threshold pair has false_alert_days = 0 and the earliest first_alert_leak_dma.
WITH x AS (
  SELECT dma_id, obs_date, mnf_vs_peer_ratio_14d AS m, nrw_excess_vs_peer_pp_14d AS e
  FROM adllabs_096.water_utilities_medallion.gold_dma_nrw_daily
  WHERE obs_date >= date_add((SELECT min(obs_date) FROM adllabs_096.water_utilities_medallion.gold_dma_nrw_daily), 13)
),
thresholds AS (
  SELECT * FROM VALUES (1.05, 0.75), (1.06, 0.75), (1.06, 1.00), (1.07, 1.00), (1.10, 1.00) AS t(mnf_threshold, nrw_pp_threshold)
)
SELECT t.mnf_threshold, t.nrw_pp_threshold,
       (t.mnf_threshold = 1.06 AND t.nrw_pp_threshold = 0.75) AS is_production_rule,
       count_if(x.m >= t.mnf_threshold AND x.e >= t.nrw_pp_threshold AND x.dma_id <> 'DMA-ADS-007') AS false_alert_days,
       count(DISTINCT CASE WHEN x.m >= t.mnf_threshold AND x.e >= t.nrw_pp_threshold AND x.dma_id <> 'DMA-ADS-007' THEN x.dma_id END) AS false_alert_dmas,
       min(CASE WHEN x.m >= t.mnf_threshold AND x.e >= t.nrw_pp_threshold AND x.dma_id = 'DMA-ADS-007' THEN x.obs_date END) AS first_alert_leak_dma,
       count_if(x.m >= t.mnf_threshold AND x.e >= t.nrw_pp_threshold AND x.dma_id = 'DMA-ADS-007' AND x.obs_date >= '2025-07-01') AS leak_dma_alert_days_since_jul,
       count_if(x.dma_id = 'DMA-ADS-007' AND x.obs_date >= '2025-07-01') AS leak_dma_days_since_jul
FROM x CROSS JOIN thresholds t
GROUP BY t.mnf_threshold, t.nrw_pp_threshold
ORDER BY t.mnf_threshold, t.nrw_pp_threshold
