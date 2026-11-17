-- System-wide daily operations: storages, River Murray pumping, plant production and energy, water quality, weather.
CREATE OR REFRESH MATERIALIZED VIEW water_utilities_medallion.gold_operations_daily
COMMENT 'Gold: one row per day with urban reservoir and bulk storage levels, River Murray pumping volume/energy/cost, plant production by kind, energy, water quality compliance and average rainfall.'
CLUSTER BY (obs_date)
AS
WITH storage AS (
  SELECT obs_date,
    SUM(CASE WHEN storage_kind = 'urban reservoir' THEN volume_ml END) AS urban_storage_volume_ml,
    SUM(CASE WHEN storage_kind = 'urban reservoir' THEN capacity_ml END) AS urban_storage_capacity_ml,
    MAX(CASE WHEN storage_kind = 'bulk storage' THEN level_pct END) AS bulk_storage_level_pct,
    SUM(inflow_ml) AS storage_inflow_ml,
    SUM(release_ml) AS storage_release_ml,
    SUM(evaporation_ml) AS storage_evaporation_ml
  FROM water_utilities_medallion.silver_storage_daily
  GROUP BY obs_date
),
pumping AS (
  SELECT operating_date AS obs_date,
    SUM(ml_pumped) AS murray_ml_pumped,
    SUM(energy_mwh) AS pumping_energy_mwh,
    SUM(energy_cost_aud) AS pumping_energy_cost_aud,
    SUM(energy_mwh) * 1000.0 / NULLIF(SUM(ml_pumped), 0) AS pumping_kwh_per_ml,
    SUM(energy_cost_aud) / NULLIF(SUM(ml_pumped), 0) AS pumping_cost_aud_per_ml,
    COUNT_IF(ml_pumped > 0) AS pump_stations_running
  FROM water_utilities_medallion.silver_pumping_daily
  GROUP BY operating_date
),
plants AS (
  SELECT operating_date AS obs_date,
    SUM(CASE WHEN plant_kind = 'water treatment' THEN production_ml END) AS water_treatment_production_ml,
    SUM(CASE WHEN plant_kind = 'seawater desalination' THEN production_ml END) AS desal_production_ml,
    SUM(CASE WHEN plant_kind = 'wastewater treatment' THEN inflow_ml END) AS wastewater_inflow_ml,
    SUM(CASE WHEN plant_kind = 'wastewater treatment' THEN recycled_ml_supplied END) AS recycled_water_supplied_ml,
    SUM(energy_mwh) AS plant_energy_mwh,
    SUM(chlorine_dose_kg) AS chlorine_dose_kg
  FROM water_utilities_medallion.silver_plant_daily
  GROUP BY operating_date
),
quality AS (
  SELECT sampled_on AS obs_date,
    COUNT(*) AS wq_samples,
    COUNT_IF(below_chlorine_target) AS wq_below_chlorine_target,
    COUNT_IF(e_coli_detected) AS wq_e_coli_detections,
    AVG(free_chlorine_mg_l) AS avg_free_chlorine_mg_l
  FROM water_utilities_medallion.silver_water_quality
  GROUP BY sampled_on
),
weather AS (
  SELECT obs_date, AVG(rainfall_mm) AS avg_rainfall_mm, MAX(max_temp_c) AS max_temp_c
  FROM water_utilities_medallion.bronze_weather_daily
  GROUP BY obs_date
)
SELECT
  s.obs_date,
  s.urban_storage_volume_ml,
  s.urban_storage_capacity_ml,
  100.0 * s.urban_storage_volume_ml / NULLIF(s.urban_storage_capacity_ml, 0) AS urban_storage_level_pct,
  s.bulk_storage_level_pct,
  s.storage_inflow_ml,
  s.storage_release_ml,
  s.storage_evaporation_ml,
  p.murray_ml_pumped,
  p.pumping_energy_mwh,
  p.pumping_energy_cost_aud,
  p.pumping_kwh_per_ml,
  p.pumping_cost_aud_per_ml,
  p.pump_stations_running,
  pl.water_treatment_production_ml,
  pl.desal_production_ml,
  pl.wastewater_inflow_ml,
  pl.recycled_water_supplied_ml,
  pl.plant_energy_mwh,
  pl.chlorine_dose_kg,
  q.wq_samples,
  q.wq_below_chlorine_target,
  q.wq_e_coli_detections,
  q.avg_free_chlorine_mg_l,
  w.avg_rainfall_mm,
  w.max_temp_c
FROM storage s
LEFT JOIN pumping p ON s.obs_date = p.obs_date
LEFT JOIN plants pl ON s.obs_date = pl.obs_date
LEFT JOIN quality q ON s.obs_date = q.obs_date
LEFT JOIN weather w ON s.obs_date = w.obs_date;
