CREATE OR REFRESH MATERIALIZED VIEW water_utilities_medallion.silver_main_breaks (
  CONSTRAINT valid_key EXPECT (break_id IS NOT NULL AND main_id IS NOT NULL AND failed_on IS NOT NULL) ON VIOLATION DROP ROW,
  CONSTRAINT known_main EXPECT (install_year IS NOT NULL),
  CONSTRAINT non_negative_repair EXPECT (repair_cost_aud >= 0 AND repair_hours >= 0)
)
COMMENT 'One row per main break, enriched with the attributes of the failed main segment and pipe age at failure.'
CLUSTER BY (dma_id, failed_on)
AS SELECT
  b.break_id,
  b.main_id,
  b.dma_id,
  b.region_id,
  b.failed_on,
  b.failed_at,
  b.failure_type,
  b.pipe_material,
  b.soil_type,
  b.hot_dry_day,
  b.probable_cause,
  b.customers_affected,
  b.repair_hours,
  b.repair_cost_aud,
  b.work_order_id,
  b.is_major,
  m.install_year,
  m.install_era,
  m.diameter_mm,
  m.is_trunk,
  year(b.failed_on) - m.install_year AS pipe_age_at_failure_yrs
FROM water_utilities_medallion.bronze_main_breaks b
LEFT JOIN water_utilities_medallion.silver_water_mains m ON b.main_id = m.main_id;
