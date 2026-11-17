-- Bronze: raw copies of reference / master tables from workshop_demo.water_utilities

CREATE OR REFRESH MATERIALIZED VIEW water_utilities_medallion.bronze_service_regions
COMMENT 'Bronze copy of workshop_demo.water_utilities.service_regions'
AS SELECT *, 'workshop_demo.water_utilities.service_regions' AS _source_table
FROM workshop_demo.water_utilities.service_regions;

CREATE OR REFRESH MATERIALIZED VIEW water_utilities_medallion.bronze_district_metered_areas
COMMENT 'Bronze copy of workshop_demo.water_utilities.district_metered_areas'
AS SELECT *, 'workshop_demo.water_utilities.district_metered_areas' AS _source_table
FROM workshop_demo.water_utilities.district_metered_areas;

CREATE OR REFRESH MATERIALIZED VIEW water_utilities_medallion.bronze_treatment_plants
COMMENT 'Bronze copy of workshop_demo.water_utilities.treatment_plants'
AS SELECT *, 'workshop_demo.water_utilities.treatment_plants' AS _source_table
FROM workshop_demo.water_utilities.treatment_plants;

CREATE OR REFRESH MATERIALIZED VIEW water_utilities_medallion.bronze_storages
COMMENT 'Bronze copy of workshop_demo.water_utilities.storages'
AS SELECT *, 'workshop_demo.water_utilities.storages' AS _source_table
FROM workshop_demo.water_utilities.storages;

CREATE OR REFRESH MATERIALIZED VIEW water_utilities_medallion.bronze_pump_stations
COMMENT 'Bronze copy of workshop_demo.water_utilities.pump_stations'
AS SELECT *, 'workshop_demo.water_utilities.pump_stations' AS _source_table
FROM workshop_demo.water_utilities.pump_stations;

CREATE OR REFRESH MATERIALIZED VIEW water_utilities_medallion.bronze_water_mains
COMMENT 'Bronze copy of workshop_demo.water_utilities.water_mains'
AS SELECT *, 'workshop_demo.water_utilities.water_mains' AS _source_table
FROM workshop_demo.water_utilities.water_mains;

CREATE OR REFRESH MATERIALIZED VIEW water_utilities_medallion.bronze_properties
COMMENT 'Bronze copy of workshop_demo.water_utilities.properties'
AS SELECT *, 'workshop_demo.water_utilities.properties' AS _source_table
FROM workshop_demo.water_utilities.properties;

CREATE OR REFRESH MATERIALIZED VIEW water_utilities_medallion.bronze_accounts
COMMENT 'Bronze copy of workshop_demo.water_utilities.accounts'
AS SELECT *, 'workshop_demo.water_utilities.accounts' AS _source_table
FROM workshop_demo.water_utilities.accounts;

CREATE OR REFRESH MATERIALIZED VIEW water_utilities_medallion.bronze_meters
COMMENT 'Bronze copy of workshop_demo.water_utilities.meters'
AS SELECT *, 'workshop_demo.water_utilities.meters' AS _source_table
FROM workshop_demo.water_utilities.meters;
