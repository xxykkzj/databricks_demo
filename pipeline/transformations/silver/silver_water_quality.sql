CREATE OR REFRESH MATERIALIZED VIEW water_utilities_medallion.silver_water_quality (
  CONSTRAINT valid_key EXPECT (sample_id IS NOT NULL AND dma_id IS NOT NULL AND sampled_on IS NOT NULL) ON VIOLATION DROP ROW,
  CONSTRAINT valid_ph EXPECT (ph BETWEEN 0 AND 14) ON VIOLATION DROP ROW,
  CONSTRAINT non_negative_chlorine EXPECT (free_chlorine_mg_l >= 0) ON VIOLATION DROP ROW
)
COMMENT 'One row per weekly DMA water quality sample, with region and compliance flags (chlorine target 0.5 mg/L, any E. coli detection).'
AS SELECT
  s.sample_id,
  s.dma_id,
  d.region_id,
  s.sampled_on,
  s.distance_from_plant_km,
  s.free_chlorine_mg_l,
  s.below_chlorine_target,
  s.e_coli_cfu_100ml,
  s.e_coli_cfu_100ml > 0 AS e_coli_detected,
  s.turbidity_ntu,
  s.thm_ug_l,
  s.ph
FROM water_utilities_medallion.bronze_water_quality_samples s
LEFT JOIN water_utilities_medallion.bronze_district_metered_areas d ON s.dma_id = d.dma_id;
