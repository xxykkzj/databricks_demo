-- Owner: data engineering subagent. Run 1st. Tested read-only on 2026-11-17 (76 rows).
-- Grain: one row per DMA per summer with a low free-chlorine case.
CREATE OR REPLACE VIEW adllabs_096.default.wq_low_chlorine_cases
(
  case_id             COMMENT 'Case key: <dma_id>:summer-YYYY-YY, for example DMA-EYY-003:summer-2025-26. Unique. Equals incident_events.event_id where event_type = low_chlorine.',
  dma_id              COMMENT 'District metered area (DMA) of the case, for example DMA-EYY-003. Joins to workshop_demo.water_utilities.district_metered_areas.dma_id.',
  season              COMMENT 'Summer of the case as text, for example summer 2025-26. A summer runs from 1 Dec to 31 Mar.',
  season_start        COMMENT 'First day of the summer: 1 December.',
  season_end          COMMENT 'Last day of the summer: 31 March.',
  season_partial      COMMENT 'True for summer 2024-25, which starts before the first day of data (1 Jan 2025), so its December samples are missing.',
  opened_on           COMMENT 'Date the case opened: the first sample of the first run of 4 or more consecutive weekly samples below 0.5 mg/L free chlorine in that summer.',
  season_samples      COMMENT 'Number of weekly water quality samples taken in the DMA during the summer, within the data window.',
  samples_below       COMMENT 'Number of those summer samples with free chlorine below the 0.5 mg/L network target.',
  min_chlorine_mg_l   COMMENT 'Lowest free chlorine residual in the DMA during the summer, in mg/L, rounded to 2 decimals. The network target is 0.5 mg/L; lower is worse.',
  closure_test_met_on COMMENT 'Closure test from the water quality notices: the first sample date after opened_on on which 4 weekly samples in a row are at or above 0.5 mg/L. It can fall after the summer ends. Null when the test is not met yet.',
  notice_doc_id       COMMENT 'doc_id of the water quality notice PDF for this DMA and summer, from workshop_demo.water_utilities.documents. Null when no notice was issued.',
  notice_published_on COMMENT 'Issue date of the water quality notice (documents.published_on); null when there is none. All notices are dated 15 Dec 2025 but describe samples to 31 March, so treat it as the issue date only.'
)
COMMENT 'One row per district metered area (DMA) per summer (1 Dec to 31 Mar) with a low free-chlorine case: 4 or more consecutive weekly samples below the 0.5 mg/L network target. opened_on is the first sample of the first such run. closure_test_met_on is the water quality notices\' own closure test: the first date after opening on which 4 weekly samples in a row are at or above 0.5 mg/L. notice_doc_id links the water quality notice PDF when one exists. season_partial marks summer 2024-25, which starts at the first day of data (1 Jan 2025). Reads workshop_demo.water_utilities in place. Synthetic data.'
AS
WITH s AS (
  SELECT dma_id, sampled_on, free_chlorine_mg_l, below_chlorine_target AS below,
         CASE WHEN month(sampled_on) = 12 THEN make_date(year(sampled_on), 12, 1)
              WHEN month(sampled_on) IN (1, 2, 3) THEN make_date(year(sampled_on) - 1, 12, 1)
         END AS season_start                     -- summer = 1 Dec to 31 Mar, as the notices count it
  FROM workshop_demo.water_utilities.water_quality_samples
),
g AS (                                           -- gaps and islands: runs of consecutive below-target samples
  SELECT *, row_number() OVER (PARTITION BY dma_id, season_start ORDER BY sampled_on)
          - row_number() OVER (PARTITION BY dma_id, season_start, below ORDER BY sampled_on) AS grp
  FROM s WHERE season_start IS NOT NULL
),
runs AS (
  SELECT dma_id, season_start, min(sampled_on) AS run_start, count(*) AS run_len
  FROM g WHERE below GROUP BY dma_id, season_start, grp
),
cases AS (                                       -- a case opens on the first run of 4+ weekly samples below 0.5 mg/L
  SELECT dma_id, season_start, min(run_start) AS opened_on
  FROM runs WHERE run_len >= 4 GROUP BY dma_id, season_start
),
season_stats AS (
  SELECT c.dma_id, c.season_start, c.opened_on, count(*) AS season_samples,
         sum(CASE WHEN s.below THEN 1 ELSE 0 END) AS samples_below,
         round(min(s.free_chlorine_mg_l), 2) AS min_chlorine_mg_l
  FROM cases c JOIN s ON s.dma_id = c.dma_id AND s.season_start = c.season_start
  GROUP BY c.dma_id, c.season_start, c.opened_on
),
after_open AS (                                  -- the notices' closure test: 4 weekly samples in a row at or above 0.5 mg/L
  SELECT c.dma_id, c.season_start, w.sampled_on,
         min(CASE WHEN w.free_chlorine_mg_l >= 0.5 THEN 1 ELSE 0 END) OVER win AS last4_ok,
         count(*) OVER win AS last4_n
  FROM cases c
  JOIN workshop_demo.water_utilities.water_quality_samples w
    ON w.dma_id = c.dma_id AND w.sampled_on > c.opened_on
  WINDOW win AS (PARTITION BY c.dma_id, c.season_start ORDER BY w.sampled_on ROWS BETWEEN 3 PRECEDING AND CURRENT ROW)
),
closure AS (
  SELECT dma_id, season_start, min(sampled_on) AS closure_test_met_on
  FROM after_open WHERE last4_ok = 1 AND last4_n = 4 GROUP BY dma_id, season_start
)
SELECT concat(st.dma_id, ':summer-', year(st.season_start), '-', right(CAST(year(st.season_start) + 1 AS STRING), 2)) AS case_id,
       st.dma_id,
       concat('summer ', year(st.season_start), '-', right(CAST(year(st.season_start) + 1 AS STRING), 2)) AS season,
       st.season_start,
       last_day(add_months(st.season_start, 3)) AS season_end,
       st.season_start < (SELECT min(sampled_on) FROM workshop_demo.water_utilities.water_quality_samples) AS season_partial,
       st.opened_on, st.season_samples, st.samples_below, st.min_chlorine_mg_l,
       cl.closure_test_met_on,
       n.doc_id AS notice_doc_id,
       n.published_on AS notice_published_on
FROM season_stats st
LEFT JOIN closure cl ON cl.dma_id = st.dma_id AND cl.season_start = st.season_start
LEFT JOIN workshop_demo.water_utilities.documents n
  ON n.doc_type = 'water_quality_notice' AND n.dma_id = st.dma_id
 AND n.published_on BETWEEN add_months(st.season_start, -1) AND add_months(st.season_start, 7)
