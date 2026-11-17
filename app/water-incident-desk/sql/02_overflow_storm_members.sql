-- Owner: data engineering subagent. Run 2nd. v2 body tested read-only on 2026-11-17 (439 rows, 53 storms).
-- Grain: one row per major sewer overflow, with its storm event (R7, D8) and its overflow report.
CREATE OR REPLACE VIEW adllabs_096.default.overflow_storm_members
(
  storm_id            COMMENT 'Storm event key: <plant_id>:<date>, for example WWTP-GLE:2025-09-27. Equals incident_events.event_id where event_type = overflow_storm.',
  plant_id            COMMENT 'Wastewater plant the overflowing sewer main drains to; with overflow_on it defines the storm. Joins to workshop_demo.water_utilities.treatment_plants.plant_id.',
  overflow_on         COMMENT 'Date of the overflow, the storm day. South Australian local date.',
  overflow_id         COMMENT 'Overflow key: the sewer_main_id, the date and a cause code. Unique. Joins to workshop_demo.water_utilities.sewer_overflows.overflow_id.',
  sewer_main_id       COMMENT 'Sewer main that overflowed. Joins to workshop_demo.water_utilities.sewer_mains.sewer_main_id.',
  rainfall_mm         COMMENT 'Rainfall in the region on the day, in millimetres.',
  volume_kl           COMMENT 'Sewage released to the environment by this overflow, in kilolitres. A major overflow is 5,000 kL or more.',
  duration_hours      COMMENT 'Hours the overflow ran before it was stopped.',
  receiving_water     COMMENT 'Where the overflow went: Gulf St Vincent, Sturt River or Patawalonga Creek.',
  cause               COMMENT 'Cause of the overflow: wet-weather inflow and infiltration, or blockage.',
  doc_id              COMMENT 'doc_id of the sewer overflow report PDF for this overflow, from workshop_demo.water_utilities.documents. Null when no report is on file.',
  doc_path            COMMENT 'Full volume path of the overflow report PDF, under /Volumes/workshop_demo/water_utilities/raw/documents/sewer_overflow_report/. Null when no report is on file.',
  report_published_on COMMENT 'Date the overflow report was issued. Null when no report is on file.'
)
COMMENT 'One row per major sewer overflow (sewer_overflows.is_major: 5,000 kL or more) with the storm event it belongs to and its overflow report. A storm event is every major overflow on one day draining to one wastewater plant: storm_id is <plant_id>:<date>, and incident_events has one overflow_storm row per storm_id. doc_id and doc_path link the sewer overflow report PDF for the overflow, null when none is on file. Reads workshop_demo.water_utilities in place. Synthetic data.'
AS
SELECT concat(o.plant_id, ':', CAST(o.overflow_on AS STRING)) AS storm_id,
       o.plant_id, o.overflow_on, o.overflow_id, o.sewer_main_id,
       o.rainfall_mm, o.volume_kl, o.duration_hours, o.receiving_water, o.cause,
       d.doc_id, d.volume_path AS doc_path, d.published_on AS report_published_on
FROM workshop_demo.water_utilities.sewer_overflows o
LEFT JOIN workshop_demo.water_utilities.documents d ON d.overflow_id = o.overflow_id
WHERE o.is_major
