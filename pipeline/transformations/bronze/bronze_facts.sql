-- Bronze: raw copies of event / daily fact tables from workshop_demo.water_utilities

CREATE OR REFRESH MATERIALIZED VIEW water_utilities_medallion.bronze_dma_flow_daily
COMMENT 'Bronze copy of workshop_demo.water_utilities.dma_flow_daily'
AS SELECT *, 'workshop_demo.water_utilities.dma_flow_daily' AS _source_table
FROM workshop_demo.water_utilities.dma_flow_daily;

CREATE OR REFRESH MATERIALIZED VIEW water_utilities_medallion.bronze_main_breaks
COMMENT 'Bronze copy of workshop_demo.water_utilities.main_breaks'
AS SELECT *, 'workshop_demo.water_utilities.main_breaks' AS _source_table
FROM workshop_demo.water_utilities.main_breaks;

CREATE OR REFRESH MATERIALIZED VIEW water_utilities_medallion.bronze_bills
COMMENT 'Bronze copy of workshop_demo.water_utilities.bills'
AS SELECT *, 'workshop_demo.water_utilities.bills' AS _source_table
FROM workshop_demo.water_utilities.bills;

CREATE OR REFRESH MATERIALIZED VIEW water_utilities_medallion.bronze_weather_daily
COMMENT 'Bronze copy of workshop_demo.water_utilities.weather_daily'
AS SELECT *, 'workshop_demo.water_utilities.weather_daily' AS _source_table
FROM workshop_demo.water_utilities.weather_daily;

CREATE OR REFRESH MATERIALIZED VIEW water_utilities_medallion.bronze_storage_daily
COMMENT 'Bronze copy of workshop_demo.water_utilities.storage_daily'
AS SELECT *, 'workshop_demo.water_utilities.storage_daily' AS _source_table
FROM workshop_demo.water_utilities.storage_daily;

CREATE OR REFRESH MATERIALIZED VIEW water_utilities_medallion.bronze_pumping_daily
COMMENT 'Bronze copy of workshop_demo.water_utilities.pumping_daily'
AS SELECT *, 'workshop_demo.water_utilities.pumping_daily' AS _source_table
FROM workshop_demo.water_utilities.pumping_daily;

CREATE OR REFRESH MATERIALIZED VIEW water_utilities_medallion.bronze_plant_daily
COMMENT 'Bronze copy of workshop_demo.water_utilities.plant_daily'
AS SELECT *, 'workshop_demo.water_utilities.plant_daily' AS _source_table
FROM workshop_demo.water_utilities.plant_daily;

CREATE OR REFRESH MATERIALIZED VIEW water_utilities_medallion.bronze_water_quality_samples
COMMENT 'Bronze copy of workshop_demo.water_utilities.water_quality_samples'
AS SELECT *, 'workshop_demo.water_utilities.water_quality_samples' AS _source_table
FROM workshop_demo.water_utilities.water_quality_samples;
