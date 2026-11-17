# Gold report: medallion pipeline review (G1 to G3)

Run on 2026-11-17, 01:03 to 01:14 UTC, by Claude Code's gold subagent (D13). I used the build identity
(`databricks`, profile `DEFAULT`, `910ba35b-cd37-465e-9e6a-bb0af5aa684a`) and warehouse `ace3100edf02c9ff`.
The pipeline is `cc41ddf7-64d5-4698-bdfe-78f80eb9591c` and it publishes `adllabs_096.water_utilities_medallion`.
The data is synthetic (`workshop_demo.water_utilities`).

**Status**
- **G1 is done**, from the SQL that the pipeline last published (`information_schema.views.view_definition`).
  I did not read the source files: the build identity cannot see the pipeline (section 1).
- **G2 is blocked by permissions.** I added no comments, edited no file and ran no update. I touched no
  source file, so there are no backups and `docs/gold-backup/` was not created.
- **G3** is this file.

Nothing was written anywhere except this report. Nothing was written in `workshop_demo`,
`water_utilities_medallion` or `adllabs_096.default`, and nothing was granted.

## 1. What blocked G2 (exact errors)

| Step | Call (build identity) | Result |
|---|---|---|
| Read the pipeline | `databricks pipelines get cc41ddf7-… -o json` | `User 910ba35b-cd37-465e-9e6a-bb0af5aa684a does not have View permissions on pipeline cc41ddf7-64d5-4698-bdfe-78f80eb9591c.` |
| Update history | `databricks pipelines list-updates cc41ddf7-…` | the same View error |
| Its ACL | `databricks pipelines get-permissions cc41ddf7-…` | `910ba35b-… does not have Manage permissions on Pipeline with ID: cc41ddf7-…. Please contact the owner or an administrator for access.` |
| Event log | `SELECT … FROM adllabs_096.default.event_log_cc41ddf7_…` | `[INSUFFICIENT_PERMISSIONS] Principal 'app-4rked7 wt' does not have SELECT on Table …` (the build identity). The column list in `information_schema` is visible. |
| Source files | workspace listing | The build identity sees only `/Workspace/Users/labuser+106@awsbricks.com/projects` (3 synced folders). In 261 folders and 2,238 files there and in `/Workspace/Shared`, there is no pipeline source. Locally, only the desk's SQL, app code and docs mention the gold views. |

- **The earlier non-JSON output** came from two causes. `databricks pipelines get` prints `text` by default
  (`-o json` is needed for JSON), and with either format the call fails with the View error above.
- **Permission levels:** without View, the build identity also lacks Run and Manage. It can neither find
  the source nor start an update.
- **Not tried, on purpose:**
  - `databricks-me`, which acts as the attendee;
  - any GRANT or `workshop-grant-me`;
  - `ALTER … COMMENT` on the materialized views. That would sit outside the source, would be lost on
    refresh, and section 4 says the medallion schema is read-only for agents.
- **To unblock:**
  - The attendee, who owns the pipeline, grants the build identity CAN_MANAGE on pipeline `cc41ddf7-…`
    and CAN_EDIT on its source folder, and I finish G2.
  - Or the attendee pastes the column lists in section 8 into the pipeline editor and runs one update.

## 2. Leak rules (`gold_dma_nrw_daily`)

Inputs:
- `silver_dma_flow_daily`: `bronze_dma_flow_daily` with DMA region and region weather;
- `silver_dim_dma` (for `connections`);
- `silver_main_breaks`.

One row per DMA per day: 240 DMAs × 681 days, 2025-01-01 to 2026-11-12.

| Column | Exact logic |
|---|---|
| `mnf_per_1000_conn` | `min_night_flow_kl_per_hour × 1000 / connections` |
| `peer_median_mnf_per_1000_conn`, `peer_median_nrw_pct` | median of the same measure across **all DMAs in the network on that day**, the DMA itself included. "Peer" is not grouped by region, pressure zone or size. |
| `mnf_vs_peer_ratio` | `mnf_per_1000_conn / peer_median_mnf_per_1000_conn` |
| `nrw_excess_vs_peer_pp` | `nrw_pct − peer_median_nrw_pct`, in percentage points (`nrw_pct` is a percentage, from 3.09 to 27.31, median 7.01) |
| `mnf_vs_peer_ratio_14d`, `nrw_excess_vs_peer_pp_14d` | mean over the DMA's last 14 rows, this day included (`ROWS 13 PRECEDING AND CURRENT ROW`) |
| **`leak_alert`** | `COALESCE(smoothing_days = 14 AND mnf_vs_peer_ratio_14d >= 1.06 AND nrw_excess_vs_peer_pp_14d >= 0.75, false)` |
| **`leak_alert_daily`** | `COALESCE(mnf_per_1000_conn >= 1.25 × peer_median_mnf_per_1000_conn AND nrw_pct >= 1.25 × peer_median_nrw_pct, false)` |
| `mnf_baseline_28d` | mean `min_night_flow_kl_per_hour` over the previous 28 rows, this day **excluded** (`28 PRECEDING AND 1 PRECEDING`). It has no minimum-history guard: it is null on day 1 (240 rows) and short in the first 4 weeks. |
| `mnf_ratio` | `min_night_flow_kl_per_hour / mnf_baseline_28d`. **Neither alert uses it or the baseline.** |
| `nrw_pct_28d_avg` | unweighted mean of `nrw_pct` over 28 rows, this day included |

**Leak rule in one line.** `leak_alert` is true when, with a full 14-day window, the DMA's night flow per
connection averages at least **1.06×** the network median and its NRW averages at least **0.75 points**
above the network median.

The two flags are **separate rules**, not a daily and a smoothed version of one rule:
- `leak_alert_daily` is stricter (1.25× on both measures, one day only).
- On this data it is true on 417 days, all at DMA-ADS-007 and all inside the `leak_alert` episode, from 2025-07-28.
- `leak_alert` is true on 497 days: one DMA, one episode, 2025-07-04 to 2026-11-12. This matches the known facts.

## 3. Risk rules (`gold_main_break_risk`)

Inputs:
- `silver_water_mains`: 40,000 mains, 7,790 km;
- `silver_main_breaks`: 17,268 breaks.

| Step | Exact logic |
|---|---|
| `years_observed` | `(datediff(max(failed_on), min(failed_on)) + 1) / 365.25` over all breaks = **1.864476** (2025-01-01 to 2026-11-12, the same on every row) |
| cohort | `material × install_era × soil_type`. `install_era` is pre-1960 / 1960-1979 / 1980-1999 / 2000+. |
| `cohort_breaks_per_100km_yr` | cohort breaks × 100 / (cohort km × `years_observed`) |
| prior weight `P` | `2 / (network breaks per km-year)` = **1.68 km-years**, the exposure in which the network averages 2 breaks. It is not an output column. |
| **`risk_score`** | `(breaks_total + P × cohort rate per km-yr) / (length_km × years_observed + P)`. This is a credibility blend of the main's own break rate and its cohort rate, in breaks per km per year. A typical segment (195 m, 0.36 km-years of exposure) gets about 82% of its weight from the cohort, and one break of its own adds about 0.49 to the score. |
| **`risk_pct_rank`** | `PERCENT_RANK() OVER (ORDER BY risk_score DESC)`: **0 = the riskiest main**, 0.9985 = the lowest (ties at score 0) |
| **`risk_tier`** | `High` if `risk_pct_rank <= 0.05`, `Medium` if `<= 0.20`, otherwise `Low`. The result is High 2,000, Medium 6,000, Low 32,000. The score cut-offs on today's data are High ≥ 3.9513 and Medium ≥ 2.3345 (maximum 7.652). |

**Risk rule in one line.** Each main gets a shrunk break rate per km per year: its own breaks, blended with
its material × era × soil cohort rate at a weight of 1.68 km-years. Mains are then ranked, and the top 5%
are High, the next 15% Medium and the rest Low.

## 4. Does "major" mean `is_major`? Yes (R1 holds)

- `gold_main_break_risk.major_breaks = COUNT_IF(is_major)` per main.
- `gold_dma_nrw_daily.major_main_breaks = COUNT_IF(is_major)` per DMA per day.
- Both read `silver_main_breaks.is_major`, which is `bronze_main_breaks` (`SELECT *` of `workshop_demo…main_breaks`).
- **Totals tie.** There are 17,268 breaks and 43 major in the source, in silver and in both gold views. `is_major`
  matches `customers_affected >= 300` on every row (0 mismatches). No break is lost or doubled by the joins.

## 5. Comments: 0 added, 32 ready

Status today: `gold_dma_nrw_daily` has 15 of 29 columns uncommented, and `gold_main_break_risk` 17 of 30.
- **The 27 existing comments are inherited.** Each one is copied word for word from a `workshop_demo` source
  column. The pipeline most likely declares no column comments, and the 32 gaps are exactly the derived columns.
- **The text below was written against the logic in sections 2 and 3.** It contains no quote characters. A
  script checked that it covers exactly the 32 uncommented columns and overwrites no existing comment.

| View | Column | Type | New comment |
|---|---|---|---|
| `gold_dma_nrw_daily` | `nrw_ml` | DOUBLE | Non-revenue water on the day in megalitres: inflow_ml minus billed_ml. |
| `gold_dma_nrw_daily` | `nrw_pct_28d_avg` | DOUBLE | Rolling 28-day average of nrw_pct, over this day and the 27 days before it. A simple mean of the daily percentages, not weighted by volume. |
| `gold_dma_nrw_daily` | `mnf_baseline_28d` | DOUBLE | Night flow baseline: average min_night_flow_kl_per_hour over the 28 days before obs_date, not counting the day itself, in kL per hour. Null on the first day of data and built from fewer days in the first 4 weeks. Context only: leak_alert does not use it. |
| `gold_dma_nrw_daily` | `mnf_ratio` | DOUBLE | min_night_flow_kl_per_hour divided by mnf_baseline_28d: night flow against the recent baseline of the same DMA, where 1.0 is normal. Context only: leak_alert does not use it. |
| `gold_dma_nrw_daily` | `mnf_per_1000_conn` | DOUBLE | Minimum night flow per 1,000 connected properties, in kL per hour: min_night_flow_kl_per_hour times 1000 divided by the DMA connection count. Makes DMAs of different sizes comparable. |
| `gold_dma_nrw_daily` | `peer_median_mnf_per_1000_conn` | DOUBLE | Peer benchmark for night flow: median mnf_per_1000_conn across all DMAs in the network on the same day, this DMA included. |
| `gold_dma_nrw_daily` | `peer_median_nrw_pct` | DOUBLE | Peer benchmark for non-revenue water: median nrw_pct across all DMAs in the network on the same day, this DMA included. |
| `gold_dma_nrw_daily` | `mnf_vs_peer_ratio` | DOUBLE | Night flow per connection against the network median on the day: mnf_per_1000_conn divided by peer_median_mnf_per_1000_conn. 1.0 is typical; 1.25 means 25% more night flow per connection than the median DMA. |
| `gold_dma_nrw_daily` | `leak_alert_daily` | BOOLEAN | Strict one-day screen, a separate rule from leak_alert: true when mnf_per_1000_conn is at least 1.25 times peer_median_mnf_per_1000_conn and nrw_pct is at least 1.25 times peer_median_nrw_pct on that day. Context only: use leak_alert for alerts. |
| `gold_dma_nrw_daily` | `nrw_excess_vs_peer_pp` | DOUBLE | Non-revenue water above the network median on the day, in percentage points: nrw_pct minus peer_median_nrw_pct. Negative when the DMA loses less than the median DMA. |
| `gold_dma_nrw_daily` | `main_breaks` | BIGINT | Water main breaks recorded in this DMA on obs_date, all failure types (bursts and leaks), from main_breaks. 0 when none. |
| `gold_dma_nrw_daily` | `major_main_breaks` | BIGINT | Of those, breaks with main_breaks.is_major true (300 or more customers affected). 0 when none. |
| `gold_dma_nrw_daily` | `mnf_vs_peer_ratio_14d` | DOUBLE | Rolling 14-day average of mnf_vs_peer_ratio, over this day and the 13 days before it. leak_alert needs 1.06 or more: at least 6% more night flow per connection than the network median, sustained. |
| `gold_dma_nrw_daily` | `nrw_excess_vs_peer_pp_14d` | DOUBLE | Rolling 14-day average of nrw_excess_vs_peer_pp, over this day and the 13 days before it, in percentage points. leak_alert needs 0.75 or more. |
| `gold_dma_nrw_daily` | `leak_alert` | BOOLEAN | Leak alert of record for this DMA and day. True when the 14-day window is full, mnf_vs_peer_ratio_14d is 1.06 or more and nrw_excess_vs_peer_pp_14d is 0.75 points or more; peers are all DMAs in the network on the same day. Never null. Flags a sustained excess over peers, not a sudden rise. Consecutive true days form one alert episode. |
| `gold_main_break_risk` | `install_era` | STRING | Install era band from install_year: pre-1960, 1960-1979, 1980-1999 or 2000+. With material and soil_type it defines the risk cohort. |
| `gold_main_break_risk` | `breaks_total` | BIGINT | Recorded breaks on this main over the observed period (see years_observed), all failure types. 0 when none. |
| `gold_main_break_risk` | `breaks_on_hot_dry_days` | BIGINT | Breaks on this main that fell on a hot dry day in its region (main_breaks.hot_dry_day), the weather that shrinks reactive clay. 0 when none. |
| `gold_main_break_risk` | `major_breaks` | BIGINT | Breaks on this main with main_breaks.is_major true (300 or more customers affected). 0 when none. |
| `gold_main_break_risk` | `customers_affected` | BIGINT | Customers affected, summed over all breaks on this main; a property hit by two breaks counts twice. 0 when none. |
| `gold_main_break_risk` | `repair_hours` | DOUBLE | Repair hours summed over all breaks on this main, from first call to repair complete. 0 when none. |
| `gold_main_break_risk` | `repair_cost_aud` | DECIMAL(28,2) | Repair cost summed over all breaks on this main, in Australian dollars. 0 when none. |
| `gold_main_break_risk` | `last_break_on` | DATE | Date of the latest break on this main. Null when it has none. |
| `gold_main_break_risk` | `years_observed` | DECIMAL(18,6) | Observation window in years: days from the first to the last break date in the whole network, inclusive, divided by 365.25. Same value on every row. |
| `gold_main_break_risk` | `cohort_segments` | BIGINT | Number of main segments in this cohort: the same material, install_era and soil_type. |
| `gold_main_break_risk` | `cohort_breaks_per_100km_yr` | DOUBLE | Break rate of the cohort (same material, install_era and soil_type), in breaks per 100 km per year: all cohort breaks times 100 divided by cohort length in km times years_observed. |
| `gold_main_break_risk` | `expected_breaks_per_yr` | DOUBLE | Breaks per year this segment would have at its cohort rate: cohort_breaks_per_100km_yr times its length in km divided by 100. Ignores the history of the main itself. |
| `gold_main_break_risk` | `observed_breaks_per_yr` | DECIMAL(38,12) | Breaks per year on this main: breaks_total divided by years_observed. |
| `gold_main_break_risk` | `observed_breaks_per_km_yr` | DOUBLE | Breaks per km per year on this main: breaks_total divided by length in km times years_observed. Noisy for short segments; risk_score smooths it. |
| `gold_main_break_risk` | `risk_score` | DOUBLE | Break likelihood in breaks per km per year, blending the history of this main with its cohort rate: (breaks_total + P times cohort rate per km-year) divided by (length in km times years_observed + P), where P is 2 divided by the network break rate per km-year. Includes the past breaks of the main. Likelihood only: no consequence, such as customers served. |
| `gold_main_break_risk` | `risk_pct_rank` | DOUBLE | Percent rank of risk_score in descending order: 0 is the riskiest main and values near 1 the least risky. Tied scores share a rank. risk_tier cuts it at 0.05 and 0.20. |
| `gold_main_break_risk` | `risk_tier` | STRING | Relative likelihood tier from risk_pct_rank: High for the riskiest 5% of mains (rank up to 0.05), Medium for the next 15% (up to 0.20), Low for the other 80%. Relative, so 5% of mains are always High. Likelihood only: it ignores consequence, and it includes the past breaks of the main. |

## 6. Update result and verification

- **No update was run** (section 1), so nothing changed.
- **Baseline today,** read as the build identity between 01:08 and 01:13 UTC, for checking after the comments go in:

| Check | Value now | Expected after the comment update |
|---|---|---|
| Uncommented columns (`information_schema.columns`) | 15 + 17 = 32 | 0 + 0 |
| Leak episodes | 1 DMA (DMA-ADS-007, Unley DMA 7), 1 episode, 2025-07-04 to 2026-11-12, 497 days | unchanged |
| Risk tiers | High 2,000, Medium 6,000, Low 32,000 | unchanged |
| Major breaks | 43 in both gold views | unchanged |

Verify with:
```sql
SELECT table_name, COUNT_IF(comment IS NULL OR trim(comment) = '') AS uncommented
FROM adllabs_096.information_schema.columns
WHERE table_schema = 'water_utilities_medallion' AND table_name IN ('gold_dma_nrw_daily', 'gold_main_break_risk')
GROUP BY table_name;
SELECT risk_tier, COUNT(*) FROM adllabs_096.water_utilities_medallion.gold_main_break_risk GROUP BY risk_tier;
SELECT dma_id, MIN(obs_date), MAX(obs_date), COUNT(*) FROM adllabs_096.water_utilities_medallion.gold_dma_nrw_daily
WHERE leak_alert GROUP BY dma_id;
```

## 7. Conflicts and concerns

Nothing in gold conflicts with section 5.3: R1, R8 and R9 read gold as designed. The concerns are about meaning.

1. **The risk score measures likelihood only** (known). 11 of the 43 major breaks sit on Low-tier mains, 23
   on Medium and 9 on High. A break is major because of how many customers the main serves, and the score
   ignores that.
2. **The tier counts the break it labels.** The score is fitted on the same breaks that the desk annotates.
   - 1,756 of the 2,000 High-tier mains have at least one break of their own.
   - I removed only each main's own breaks, holding the cohort rate and `P` fixed. That is an approximation.
     The 43 major-break mains would then be High **0**, Medium 18 and Low 25.
   - So all 9 "major breaks on High-risk mains" are High partly because of those breaks. The tier is not a
     forecast made before the failure.
   - This matters for C7 and for the Genie One question "How many major breaks were on high-risk mains?".
3. **The tiers are relative.** 5% of mains are always High, whatever the absolute risk, so a tier means
   "riskier than most of this network", not a set probability.
4. **`risk_score` is a rate per km.** For mains with no breaks, a longer segment scores lower: more km-years
   without a break is evidence of a lower rate. The score is not the chance that a given segment breaks;
   `expected_breaks_per_yr` is the per-segment figure, and it uses the cohort rate only.
5. **The leak flags can be confused.**
   - `leak_alert` and `leak_alert_daily` are independent rules, though their names suggest one rule at two
     time scales. The desk correctly uses `leak_alert`.
   - The view comment says "minimum night flow vs 28-day baseline, leak alert flag", but the alert never uses
     the 28-day baseline. It compares the DMA with the network median.
   - Suggested view comment, also comments only: *Gold: one row per DMA per day with non-revenue water,
     minimum night flow against its own 28-day baseline and against the network median, the leak alert
     (a sustained 14-day excess over the network median), main breaks and weather.*
6. **Threshold sensitivity, and the coupling to the desk.**
   - After the 14-day warm-up, no other DMA meets both conditions. The closest reaches 0.98 of the joint
     threshold.
   - Every other DMA that meets both conditions does so only on 1 or 2 Jan 2025, which the full-window guard blocks.
   - At a ratio threshold of 1.05, DMA-ADS-007 shows **2 episodes** (501 days, the first from 2025-06-29),
     so C1 would change.
   - At 1.065 the result is the same as today. At 1.07 it is still one episode, starting a day later.
   - NRW thresholds of 0.5 and 1.0 (tested with 1.06) give the same single episode.
   - The thresholds look fitted to this dataset. That is my inference: I can't see the source history.
   - Any gold threshold change moves desk events, so section 5.6 should record 1.06 and 0.75 next to `leak_alert`.
7. **Recent redefinition.** Both desk-facing gold views were last altered at 00:31 UTC, 30 minutes after the
   first build at 00:01 (`information_schema.tables.last_altered`). I can't see what changed without View on the pipeline.
8. **Minor, with no effect on the desk:**
   - `baseline_days` and `smoothing_days` are computed. Only `smoothing_days` is used, and neither is output.
   - `nrw_pct_28d_avg` is not weighted by volume.
   - The peer median divides by `connections` without `NULLIF`. That is safe today, because every DMA has connections.
9. **Identity gotcha for every agent.** In this shell, Python `WorkspaceClient(profile="DEFAULT")` reads
   `DATABRICKS_CONFIG_FILE`, which points at the omnigent config. It then authenticates as the **attendee**.
   - The `databricks` wrapper swaps in `~/.databrickscfg`; Python must pass `config_file="~/.databrickscfg"`.
   - Before I pinned the config, my first three SQL calls ran as the attendee. They were read-only and on
     `information_schema`. A workspace listing also ran as the attendee, and failed on token scope.
   - I re-ran everything this report relies on as the build identity: the definitions, the comments, the
     timestamps and every count. The results were identical.

## 8. Appendix: column lists ready to paste

In each gold view's SQL source:
- Insert the column list between the view name and `COMMENT`, and leave the query byte-identical.
- If the source is Python, the same column definitions go in `schema="""…"""`.
- The 27 inherited comments are restated, so every column keeps a comment whatever the pipeline propagates.
- The types are the current output types from `information_schema`.
- The one quote is written `\'`. On this warehouse, `''` would join two literals.

This is **untested in the pipeline**, because I have no access. Run one normal update afterwards, not a full
refresh, then the checks in section 6.

#### `gold_dma_nrw_daily` (29 columns, 15 new comments)

```sql
CREATE OR REFRESH MATERIALIZED VIEW gold_dma_nrw_daily (
  dma_id STRING COMMENT 'District metered area. Joins to district_metered_areas.dma_id.',
  dma_name STRING COMMENT 'Readable DMA name, usually the suburb and the DMA number.',
  region_id STRING COMMENT 'Service region the DMA sits in. Joins to service_regions.region_id.',
  region_name STRING COMMENT 'Region name, for example Adelaide North or Murraylands and Riverland.',
  pressure_zone STRING COMMENT 'Pressure zone of the DMA: Low, Mid or High, set by ground height above sea level.',
  dominant_soil STRING COMMENT 'Soil most of the DMA\'s pipes sit in: reactive clay, sandy loam, loam, limestone or sand.',
  obs_date DATE COMMENT 'Calendar day, South Australian local date.',
  inflow_ml DOUBLE COMMENT 'Water flowing into the DMA on the day, in megalitres, measured at the DMA inlet meter.',
  billed_ml DOUBLE COMMENT 'Volume registered by customer meters in the DMA on the day, in megalitres.',
  nrw_ml DOUBLE COMMENT 'Non-revenue water on the day in megalitres: inflow_ml minus billed_ml.',
  nrw_pct DOUBLE COMMENT 'Non-revenue water as a percentage of inflow: water that was not billed, from leaks, meter error and theft.',
  nrw_pct_28d_avg DOUBLE COMMENT 'Rolling 28-day average of nrw_pct, over this day and the 27 days before it. A simple mean of the daily percentages, not weighted by volume.',
  min_night_flow_kl_per_hour DOUBLE COMMENT 'Minimum night flow in kilolitres per hour, the lowest hourly inflow between 2 and 4 AM.',
  mnf_baseline_28d DOUBLE COMMENT 'Night flow baseline: average min_night_flow_kl_per_hour over the 28 days before obs_date, not counting the day itself, in kL per hour. Null on the first day of data and built from fewer days in the first 4 weeks. Context only: leak_alert does not use it.',
  mnf_ratio DOUBLE COMMENT 'min_night_flow_kl_per_hour divided by mnf_baseline_28d: night flow against the recent baseline of the same DMA, where 1.0 is normal. Context only: leak_alert does not use it.',
  mnf_per_1000_conn DOUBLE COMMENT 'Minimum night flow per 1,000 connected properties, in kL per hour: min_night_flow_kl_per_hour times 1000 divided by the DMA connection count. Makes DMAs of different sizes comparable.',
  peer_median_mnf_per_1000_conn DOUBLE COMMENT 'Peer benchmark for night flow: median mnf_per_1000_conn across all DMAs in the network on the same day, this DMA included.',
  peer_median_nrw_pct DOUBLE COMMENT 'Peer benchmark for non-revenue water: median nrw_pct across all DMAs in the network on the same day, this DMA included.',
  mnf_vs_peer_ratio DOUBLE COMMENT 'Night flow per connection against the network median on the day: mnf_per_1000_conn divided by peer_median_mnf_per_1000_conn. 1.0 is typical; 1.25 means 25% more night flow per connection than the median DMA.',
  leak_alert_daily BOOLEAN COMMENT 'Strict one-day screen, a separate rule from leak_alert: true when mnf_per_1000_conn is at least 1.25 times peer_median_mnf_per_1000_conn and nrw_pct is at least 1.25 times peer_median_nrw_pct on that day. Context only: use leak_alert for alerts.',
  nrw_excess_vs_peer_pp DOUBLE COMMENT 'Non-revenue water above the network median on the day, in percentage points: nrw_pct minus peer_median_nrw_pct. Negative when the DMA loses less than the median DMA.',
  main_breaks BIGINT COMMENT 'Water main breaks recorded in this DMA on obs_date, all failure types (bursts and leaks), from main_breaks. 0 when none.',
  major_main_breaks BIGINT COMMENT 'Of those, breaks with main_breaks.is_major true (300 or more customers affected). 0 when none.',
  rainfall_mm DOUBLE COMMENT 'Rainfall recorded on the day, in millimetres. Zero on dry days.',
  max_temp_c DOUBLE COMMENT 'Maximum air temperature on the day, in degrees Celsius.',
  hot_dry_day BOOLEAN COMMENT 'True when max_temp_c is 33 C or more and dry_spell_days is 5 or more. Used for clay-soil shrinkage.',
  mnf_vs_peer_ratio_14d DOUBLE COMMENT 'Rolling 14-day average of mnf_vs_peer_ratio, over this day and the 13 days before it. leak_alert needs 1.06 or more: at least 6% more night flow per connection than the network median, sustained.',
  nrw_excess_vs_peer_pp_14d DOUBLE COMMENT 'Rolling 14-day average of nrw_excess_vs_peer_pp, over this day and the 13 days before it, in percentage points. leak_alert needs 0.75 or more.',
  leak_alert BOOLEAN COMMENT 'Leak alert of record for this DMA and day. True when the 14-day window is full, mnf_vs_peer_ratio_14d is 1.06 or more and nrw_excess_vs_peer_pp_14d is 0.75 points or more; peers are all DMAs in the network on the same day. Never null. Flags a sustained excess over peers, not a sudden rise. Consecutive true days form one alert episode.'
)
COMMENT 'Gold: daily non-revenue water, minimum night flow vs 28-day baseline, leak alert flag, main breaks and weather per DMA.'
AS
-- the existing query, byte-for-byte unchanged
```

#### `gold_main_break_risk` (30 columns, 17 new comments)

```sql
CREATE OR REFRESH MATERIALIZED VIEW gold_main_break_risk (
  main_id STRING COMMENT 'Main key, WM followed by 6 digits. Joins to main_breaks.main_id.',
  dma_id STRING COMMENT 'District metered area the main is in. Joins to district_metered_areas.dma_id.',
  dma_name STRING COMMENT 'Readable DMA name, usually the suburb and the DMA number.',
  region_id STRING COMMENT 'Service region the main is in. Joins to service_regions.region_id.',
  region_name STRING COMMENT 'Region name, for example Adelaide North or Murraylands and Riverland.',
  material STRING COMMENT 'Pipe material: AC asbestos cement, CI cast iron, DICL ductile iron cement lined, PVC, PE polyethylene.',
  install_year INT COMMENT 'Year the main was laid.',
  install_era STRING COMMENT 'Install era band from install_year: pre-1960, 1960-1979, 1980-1999 or 2000+. With material and soil_type it defines the risk cohort.',
  diameter_mm INT COMMENT 'Nominal internal diameter of the pipe in millimetres.',
  length_m DOUBLE COMMENT 'Length of the segment in metres.',
  soil_type STRING COMMENT 'Soil the pipe runs through: reactive clay (shrinks and swells), sandy loam, loam, limestone or sand.',
  is_trunk BOOLEAN COMMENT 'True for trunk mains of 375 mm diameter or more.',
  latitude DOUBLE COMMENT 'Approximate latitude of the segment midpoint, WGS84 decimal degrees.',
  longitude DOUBLE COMMENT 'Approximate longitude of the segment midpoint, WGS84 decimal degrees.',
  breaks_total BIGINT COMMENT 'Recorded breaks on this main over the observed period (see years_observed), all failure types. 0 when none.',
  breaks_on_hot_dry_days BIGINT COMMENT 'Breaks on this main that fell on a hot dry day in its region (main_breaks.hot_dry_day), the weather that shrinks reactive clay. 0 when none.',
  major_breaks BIGINT COMMENT 'Breaks on this main with main_breaks.is_major true (300 or more customers affected). 0 when none.',
  customers_affected BIGINT COMMENT 'Customers affected, summed over all breaks on this main; a property hit by two breaks counts twice. 0 when none.',
  repair_hours DOUBLE COMMENT 'Repair hours summed over all breaks on this main, from first call to repair complete. 0 when none.',
  repair_cost_aud DECIMAL(28,2) COMMENT 'Repair cost summed over all breaks on this main, in Australian dollars. 0 when none.',
  last_break_on DATE COMMENT 'Date of the latest break on this main. Null when it has none.',
  years_observed DECIMAL(18,6) COMMENT 'Observation window in years: days from the first to the last break date in the whole network, inclusive, divided by 365.25. Same value on every row.',
  cohort_segments BIGINT COMMENT 'Number of main segments in this cohort: the same material, install_era and soil_type.',
  cohort_breaks_per_100km_yr DOUBLE COMMENT 'Break rate of the cohort (same material, install_era and soil_type), in breaks per 100 km per year: all cohort breaks times 100 divided by cohort length in km times years_observed.',
  expected_breaks_per_yr DOUBLE COMMENT 'Breaks per year this segment would have at its cohort rate: cohort_breaks_per_100km_yr times its length in km divided by 100. Ignores the history of the main itself.',
  observed_breaks_per_yr DECIMAL(38,12) COMMENT 'Breaks per year on this main: breaks_total divided by years_observed.',
  observed_breaks_per_km_yr DOUBLE COMMENT 'Breaks per km per year on this main: breaks_total divided by length in km times years_observed. Noisy for short segments; risk_score smooths it.',
  risk_score DOUBLE COMMENT 'Break likelihood in breaks per km per year, blending the history of this main with its cohort rate: (breaks_total + P times cohort rate per km-year) divided by (length in km times years_observed + P), where P is 2 divided by the network break rate per km-year. Includes the past breaks of the main. Likelihood only: no consequence, such as customers served.',
  risk_pct_rank DOUBLE COMMENT 'Percent rank of risk_score in descending order: 0 is the riskiest main and values near 1 the least risky. Tied scores share a rank. risk_tier cuts it at 0.05 and 0.20.',
  risk_tier STRING COMMENT 'Relative likelihood tier from risk_pct_rank: High for the riskiest 5% of mains (rank up to 0.05), Medium for the next 15% (up to 0.20), Low for the other 80%. Relative, so 5% of mains are always High. Likelihood only: it ignores consequence, and it includes the past breaks of the main.'
)
COMMENT 'Gold: one row per water main segment with break history, cohort break rate (material x install era x soil), risk score and risk tier.'
AS
-- the existing query, byte-for-byte unchanged
```
