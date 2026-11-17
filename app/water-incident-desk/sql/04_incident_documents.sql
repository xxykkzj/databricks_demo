-- Owner: data engineering subagent. Run 4th. v2 body tested read-only on 2026-11-17 (56 rows).
-- Grain: one row per PDF indexed in workshop_demo.water_utilities.documents.
CREATE OR REPLACE VIEW adllabs_096.default.incident_documents
(
  doc_id       COMMENT 'Document key, for example DOC-BRK-0001 or DOC-GUIDE-001. Unique.',
  doc_type     COMMENT 'Kind of document: incident_report (a major main break), sewer_overflow_report (a major sewer overflow), water_quality_notice (a low-chlorine case), pumping_memo or data_guide.',
  title        COMMENT 'Title of the document, as printed on its first page.',
  published_on COMMENT 'Date the document was issued. Water quality notices are all dated 15 Dec 2025 but describe samples to 31 March, so treat it as the issue date only.',
  doc_path     COMMENT 'Full path to the PDF under /Volumes/workshop_demo/water_utilities/raw/documents/, in one folder per type: guide, incident_report, pumping_memo, sewer_overflow_report or water_quality_notice.',
  file_name    COMMENT 'File name of the PDF: the last part of doc_path, for example brk_0001.pdf.',
  dma_id       COMMENT 'District metered area the document is about, when there is one. Joins to workshop_demo.water_utilities.district_metered_areas.dma_id.',
  plant_id     COMMENT 'Treatment or wastewater plant the document is about, when there is one. Joins to workshop_demo.water_utilities.treatment_plants.plant_id.',
  break_id     COMMENT 'Main break the document is about (incident reports only). Joins to workshop_demo.water_utilities.main_breaks.break_id.',
  overflow_id  COMMENT 'Sewer overflow the document is about (sewer overflow reports only). Joins to workshop_demo.water_utilities.sewer_overflows.overflow_id and to overflow_storm_members.overflow_id.',
  event_type   COMMENT 'Incident register event type the document belongs to: major_break (incident reports), overflow_storm (sewer overflow reports, through the storm of their overflow) or low_chlorine (water quality notices). Null for documents that belong to no event (the pumping memos and the data guide).',
  event_id     COMMENT 'Incident register event the document belongs to: the break_id, the storm_id (<plant_id>:<date>) or the chlorine case_id. Join to incident_events on (event_type, event_id). Null for the pumping memos and the data guide.'
)
COMMENT 'One row per PDF indexed in workshop_demo.water_utilities.documents, with the incident register event it belongs to (event_type, event_id; null for the pumping memos and the data guide). A sewer overflow report belongs to the storm event of its overflow (overflow_storm, <plant_id>:<date>). doc_path is the full volume path under /Volumes/workshop_demo/water_utilities/raw/documents/. PDFs that land in the volume without a documents row are not here: the app finds them by listing the volume. Synthetic data.'
AS
SELECT d.doc_id, d.doc_type, d.title, d.published_on,
       d.volume_path AS doc_path,
       element_at(split(d.volume_path, '/'), -1) AS file_name,
       d.dma_id, d.plant_id, d.break_id, d.overflow_id,
       CASE WHEN d.break_id IS NOT NULL THEN 'major_break'
            WHEN m.storm_id IS NOT NULL THEN 'overflow_storm'
            WHEN c.case_id IS NOT NULL THEN 'low_chlorine' END AS event_type,
       coalesce(d.break_id, m.storm_id, c.case_id) AS event_id
FROM workshop_demo.water_utilities.documents d
LEFT JOIN adllabs_096.default.overflow_storm_members m ON m.doc_id = d.doc_id
LEFT JOIN adllabs_096.default.wq_low_chlorine_cases c ON c.notice_doc_id = d.doc_id
