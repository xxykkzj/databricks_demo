-- Copy the read-only workshop mock data into a writable schema.
-- Run on a SQL warehouse or serverless. The raw volume files (56 PDFs) are copied separately, e.g. with dbutils.fs.cp.
CREATE SCHEMA IF NOT EXISTS adllabs_096.water_utilities
  COMMENT 'Copy of workshop_demo.water_utilities mock data (deep clone)';
CREATE VOLUME IF NOT EXISTS adllabs_096.water_utilities.raw;

CREATE TABLE IF NOT EXISTS adllabs_096.water_utilities.accounts DEEP CLONE workshop_demo.water_utilities.accounts;
CREATE TABLE IF NOT EXISTS adllabs_096.water_utilities.bills DEEP CLONE workshop_demo.water_utilities.bills;
CREATE TABLE IF NOT EXISTS adllabs_096.water_utilities.district_metered_areas DEEP CLONE workshop_demo.water_utilities.district_metered_areas;
CREATE TABLE IF NOT EXISTS adllabs_096.water_utilities.dma_flow_daily DEEP CLONE workshop_demo.water_utilities.dma_flow_daily;
CREATE TABLE IF NOT EXISTS adllabs_096.water_utilities.documents DEEP CLONE workshop_demo.water_utilities.documents;
CREATE TABLE IF NOT EXISTS adllabs_096.water_utilities.main_breaks DEEP CLONE workshop_demo.water_utilities.main_breaks;
CREATE TABLE IF NOT EXISTS adllabs_096.water_utilities.meter_reads DEEP CLONE workshop_demo.water_utilities.meter_reads;
CREATE TABLE IF NOT EXISTS adllabs_096.water_utilities.meters DEEP CLONE workshop_demo.water_utilities.meters;
CREATE TABLE IF NOT EXISTS adllabs_096.water_utilities.plant_daily DEEP CLONE workshop_demo.water_utilities.plant_daily;
CREATE TABLE IF NOT EXISTS adllabs_096.water_utilities.properties DEEP CLONE workshop_demo.water_utilities.properties;
CREATE TABLE IF NOT EXISTS adllabs_096.water_utilities.property360 DEEP CLONE workshop_demo.water_utilities.property360;
CREATE TABLE IF NOT EXISTS adllabs_096.water_utilities.pump_stations DEEP CLONE workshop_demo.water_utilities.pump_stations;
CREATE TABLE IF NOT EXISTS adllabs_096.water_utilities.pumping_daily DEEP CLONE workshop_demo.water_utilities.pumping_daily;
CREATE TABLE IF NOT EXISTS adllabs_096.water_utilities.service_regions DEEP CLONE workshop_demo.water_utilities.service_regions;
CREATE TABLE IF NOT EXISTS adllabs_096.water_utilities.sewer_mains DEEP CLONE workshop_demo.water_utilities.sewer_mains;
CREATE TABLE IF NOT EXISTS adllabs_096.water_utilities.sewer_overflows DEEP CLONE workshop_demo.water_utilities.sewer_overflows;
CREATE TABLE IF NOT EXISTS adllabs_096.water_utilities.storage_daily DEEP CLONE workshop_demo.water_utilities.storage_daily;
CREATE TABLE IF NOT EXISTS adllabs_096.water_utilities.storages DEEP CLONE workshop_demo.water_utilities.storages;
CREATE TABLE IF NOT EXISTS adllabs_096.water_utilities.treatment_plants DEEP CLONE workshop_demo.water_utilities.treatment_plants;
CREATE TABLE IF NOT EXISTS adllabs_096.water_utilities.water_mains DEEP CLONE workshop_demo.water_utilities.water_mains;
CREATE TABLE IF NOT EXISTS adllabs_096.water_utilities.water_quality_samples DEEP CLONE workshop_demo.water_utilities.water_quality_samples;
CREATE TABLE IF NOT EXISTS adllabs_096.water_utilities.weather_daily DEEP CLONE workshop_demo.water_utilities.weather_daily;
