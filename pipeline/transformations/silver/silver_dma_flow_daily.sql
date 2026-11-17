CREATE OR REFRESH MATERIALIZED VIEW water_utilities_medallion.silver_dma_flow_daily (
  CONSTRAINT valid_key EXPECT (dma_id IS NOT NULL AND obs_date IS NOT NULL) ON VIOLATION DROP ROW,
  CONSTRAINT non_negative_flow EXPECT (inflow_ml >= 0 AND billed_ml >= 0) ON VIOLATION DROP ROW,
  CONSTRAINT nrw_pct_in_range EXPECT (nrw_pct BETWEEN 0 AND 100),
  CONSTRAINT has_weather EXPECT (rainfall_mm IS NOT NULL)
)
COMMENT 'One row per DMA per day: inflow, billed volume, non-revenue water and minimum night flow, with the region weather for that day.'
CLUSTER BY (dma_id, obs_date)
AS SELECT
  f.dma_id,
  f.obs_date,
  d.region_id,
  f.inflow_ml,
  f.billed_ml,
  f.inflow_ml - f.billed_ml AS nrw_ml,
  f.nrw_pct,
  f.min_night_flow_kl_per_hour,
  w.rainfall_mm,
  w.max_temp_c,
  w.dry_spell_days,
  w.hot_dry_day
FROM water_utilities_medallion.bronze_dma_flow_daily f
JOIN water_utilities_medallion.bronze_district_metered_areas d ON f.dma_id = d.dma_id
LEFT JOIN water_utilities_medallion.bronze_weather_daily w
  ON w.region_id = d.region_id AND w.obs_date = f.obs_date;
