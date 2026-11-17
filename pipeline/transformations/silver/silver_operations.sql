-- Silver: daily operational facts enriched with their asset attributes

CREATE OR REFRESH MATERIALIZED VIEW water_utilities_medallion.silver_storage_daily (
  CONSTRAINT valid_key EXPECT (storage_id IS NOT NULL AND obs_date IS NOT NULL) ON VIOLATION DROP ROW,
  CONSTRAINT level_in_range EXPECT (level_pct BETWEEN 0 AND 100)
)
COMMENT 'One row per storage per day with storage name, kind and capacity.'
AS SELECT
  d.storage_id,
  s.storage_name,
  s.storage_kind,
  s.region_id,
  s.capacity_ml,
  d.obs_date,
  d.level_pct,
  d.volume_ml,
  d.inflow_ml,
  d.release_ml,
  d.evaporation_ml
FROM water_utilities_medallion.bronze_storage_daily d
LEFT JOIN water_utilities_medallion.bronze_storages s ON d.storage_id = s.storage_id;

CREATE OR REFRESH MATERIALIZED VIEW water_utilities_medallion.silver_pumping_daily (
  CONSTRAINT valid_key EXPECT (pump_station_id IS NOT NULL AND operating_date IS NOT NULL) ON VIOLATION DROP ROW,
  CONSTRAINT non_negative_pumping EXPECT (ml_pumped >= 0 AND energy_mwh >= 0)
)
COMMENT 'One row per River Murray pump station per day with station and pipeline attributes.'
AS SELECT
  d.pump_station_id,
  s.station_name,
  s.pipeline_code,
  s.pipeline_name,
  s.region_id,
  d.operating_date,
  d.ml_pumped,
  d.run_hours,
  d.energy_mwh,
  d.kwh_per_ml,
  d.price_aud_per_mwh,
  d.energy_cost_aud,
  d.urban_storage_level_pct
FROM water_utilities_medallion.bronze_pumping_daily d
LEFT JOIN water_utilities_medallion.bronze_pump_stations s ON d.pump_station_id = s.pump_station_id;

CREATE OR REFRESH MATERIALIZED VIEW water_utilities_medallion.silver_plant_daily (
  CONSTRAINT valid_key EXPECT (plant_id IS NOT NULL AND operating_date IS NOT NULL) ON VIOLATION DROP ROW,
  CONSTRAINT non_negative_energy EXPECT (energy_mwh >= 0)
)
COMMENT 'One row per treatment plant per day with plant name and kind (water treatment, seawater desalination, wastewater treatment).'
AS SELECT
  d.plant_id,
  p.plant_name,
  p.plant_kind,
  p.region_id,
  d.operating_date,
  d.production_ml,
  d.inflow_ml,
  d.recycled_ml_supplied,
  d.energy_mwh,
  d.chlorine_dose_kg
FROM water_utilities_medallion.bronze_plant_daily d
LEFT JOIN water_utilities_medallion.bronze_treatment_plants p ON d.plant_id = p.plant_id;
