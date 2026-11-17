-- Asset risk per water main segment.
-- cohort_breaks_per_100km_yr: observed break rate for mains sharing material, install era and soil.
-- expected_breaks_per_yr: cohort rate scaled to this segment's length (absolute volume, for workload planning).
-- risk_score: length-normalised break rate per km per year, credibility-weighted toward the cohort rate:
--   (breaks_total + prior_km_yr * cohort_rate_km_yr) / (length_km * years_observed + prior_km_yr)
--   prior_km_yr = 2 / network break rate per km-yr, i.e. the prior is worth 2 breaks at the network-average rate.
--   This lets short and long segments be compared fairly; short pipes with one break are not over-ranked.
-- risk_tier: High = top 5% of risk_score, Medium = next 15%, otherwise Low.
CREATE OR REFRESH MATERIALIZED VIEW water_utilities_medallion.gold_main_break_risk
COMMENT 'Gold: one row per water main segment with break history, cohort break rate (material x install era x soil), risk score and risk tier.'
CLUSTER BY (dma_id, risk_tier)
AS
WITH obs AS (
  SELECT (datediff(MAX(failed_on), MIN(failed_on)) + 1) / 365.25 AS years_observed
  FROM water_utilities_medallion.silver_main_breaks
),
br AS (
  SELECT main_id,
    COUNT(*) AS breaks_total,
    COUNT_IF(hot_dry_day) AS breaks_on_hot_dry_days,
    COUNT_IF(is_major) AS major_breaks,
    SUM(customers_affected) AS customers_affected,
    SUM(repair_hours) AS repair_hours,
    SUM(repair_cost_aud) AS repair_cost_aud,
    MAX(failed_on) AS last_break_on
  FROM water_utilities_medallion.silver_main_breaks
  GROUP BY main_id
),
m AS (
  SELECT
    w.*,
    COALESCE(br.breaks_total, 0) AS breaks_total,
    COALESCE(br.breaks_on_hot_dry_days, 0) AS breaks_on_hot_dry_days,
    COALESCE(br.major_breaks, 0) AS major_breaks,
    COALESCE(br.customers_affected, 0) AS customers_affected,
    COALESCE(br.repair_hours, 0) AS repair_hours,
    COALESCE(br.repair_cost_aud, 0) AS repair_cost_aud,
    br.last_break_on,
    obs.years_observed
  FROM water_utilities_medallion.silver_water_mains w
  CROSS JOIN obs
  LEFT JOIN br ON w.main_id = br.main_id
),
cohort AS (
  SELECT m.*,
    SUM(breaks_total) OVER (PARTITION BY material, install_era, soil_type) * 100.0
      / NULLIF(SUM(length_km) OVER (PARTITION BY material, install_era, soil_type) * years_observed, 0)
      AS cohort_breaks_per_100km_yr,
    COUNT(*) OVER (PARTITION BY material, install_era, soil_type) AS cohort_segments
  FROM m
),
net AS (
  SELECT 2.0 / (SUM(breaks_total) / SUM(length_km * years_observed)) AS prior_km_yr
  FROM m
),
scored AS (
  SELECT c.*,
    net.prior_km_yr,
    c.cohort_breaks_per_100km_yr * c.length_km / 100.0 AS expected_breaks_per_yr,
    c.breaks_total / c.years_observed AS observed_breaks_per_yr,
    c.breaks_total / NULLIF(c.length_km * c.years_observed, 0) AS observed_breaks_per_km_yr,
    (c.breaks_total + net.prior_km_yr * COALESCE(c.cohort_breaks_per_100km_yr, 0) / 100.0)
      / (c.length_km * c.years_observed + net.prior_km_yr) AS risk_score
  FROM cohort c
  CROSS JOIN net
),
ranked AS (
  SELECT s.*, PERCENT_RANK() OVER (ORDER BY s.risk_score DESC) AS risk_pct_rank
  FROM scored s
)
SELECT
  r.main_id,
  r.dma_id,
  d.dma_name,
  r.region_id,
  d.region_name,
  r.material,
  r.install_year,
  r.install_era,
  r.diameter_mm,
  r.length_m,
  r.soil_type,
  r.is_trunk,
  r.latitude,
  r.longitude,
  r.breaks_total,
  r.breaks_on_hot_dry_days,
  r.major_breaks,
  r.customers_affected,
  r.repair_hours,
  r.repair_cost_aud,
  r.last_break_on,
  r.years_observed,
  r.cohort_segments,
  r.cohort_breaks_per_100km_yr,
  r.expected_breaks_per_yr,
  r.observed_breaks_per_yr,
  r.observed_breaks_per_km_yr,
  r.risk_score,
  r.risk_pct_rank,
  CASE WHEN r.risk_pct_rank <= 0.05 THEN 'High'
       WHEN r.risk_pct_rank <= 0.20 THEN 'Medium'
       ELSE 'Low' END AS risk_tier
FROM ranked r
LEFT JOIN water_utilities_medallion.silver_dim_dma d ON r.dma_id = d.dma_id;
