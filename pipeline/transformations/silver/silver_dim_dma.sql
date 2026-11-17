CREATE OR REFRESH MATERIALIZED VIEW water_utilities_medallion.silver_dim_dma (
  CONSTRAINT dma_id_not_null EXPECT (dma_id IS NOT NULL) ON VIOLATION FAIL UPDATE,
  CONSTRAINT has_region EXPECT (region_name IS NOT NULL)
)
COMMENT 'One row per district metered area, enriched with service region and supplying treatment plant.'
AS SELECT
  d.dma_id,
  d.dma_name,
  d.region_id,
  r.region_name,
  r.region_type,
  d.suburb,
  d.postcode,
  d.lga,
  d.pressure_zone,
  d.connections,
  d.dominant_soil,
  d.distance_from_plant_km,
  d.treatment_plant_id,
  p.plant_name AS treatment_plant_name,
  d.mains_km,
  d.latitude,
  d.longitude
FROM water_utilities_medallion.bronze_district_metered_areas d
LEFT JOIN water_utilities_medallion.bronze_service_regions r ON d.region_id = r.region_id
LEFT JOIN water_utilities_medallion.bronze_treatment_plants p ON d.treatment_plant_id = p.plant_id;
