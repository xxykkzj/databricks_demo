CREATE OR REFRESH MATERIALIZED VIEW water_utilities_medallion.silver_water_mains (
  CONSTRAINT main_id_not_null EXPECT (main_id IS NOT NULL) ON VIOLATION FAIL UPDATE,
  CONSTRAINT positive_length EXPECT (length_m > 0),
  CONSTRAINT plausible_install_year EXPECT (install_year BETWEEN 1850 AND 2030)
)
COMMENT 'One row per water main segment with install era band and length in km.'
AS SELECT
  m.main_id,
  m.dma_id,
  m.region_id,
  m.material,
  m.install_year,
  CAST(floor(m.install_year / 10) * 10 AS INT) AS install_decade,
  CASE
    WHEN m.install_year < 1960 THEN 'pre-1960'
    WHEN m.install_year < 1980 THEN '1960-1979'
    WHEN m.install_year < 2000 THEN '1980-1999'
    ELSE '2000+'
  END AS install_era,
  m.diameter_mm,
  m.length_m,
  m.length_m / 1000.0 AS length_km,
  m.soil_type,
  m.depth_m,
  m.is_trunk,
  m.latitude,
  m.longitude
FROM water_utilities_medallion.bronze_water_mains m;
