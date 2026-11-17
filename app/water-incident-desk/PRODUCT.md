# Product

<!-- impeccable:product-schema 1 -->

Derived from `ARCHITECTURE.md`, which the attendee approved on 2026-11-17 (decisions D1–D13).

## Platform

web

## Users

An operations or compliance officer at a water and wastewater utility. They work at a desk, in daylight,
beside other enterprise tools. Their job is to work through major network events (main breaks, storm
sewer overflows, low-chlorine cases, leak alerts), decide what happens next, and keep a record that
stands up to a regulator's questions.

## Product Purpose

The Incident & Report Desk puts every major event in one register, with the report PDF beside the record and a status
that people set and the app saves. Success: an officer can see what is open, why, and what
report is missing, and can change a status in seconds, leaving a full history.

## Positioning

The status is suggested from the data and confirmed by a person. Examples: a water quality notice's own
four-week closure test, or a storm with 10 of 28 overflow reports on file. Each PDF is shown beside its
record, because every report holds facts no table has.

## Operating Context

- **Data:** synthetic data for Torrens Gulf Water Corporation, a fictional utility in real South
  Australian places, running 1 Jan 2025 to 12 Nov 2026. "Recent" is anchored to the last day of data,
  never to today.
- **PDFs:** they land in `/Volumes/workshop_demo/water_utilities/raw/`. Some are not indexed yet.
- **Genie One:** the attendee's business-context chat. It reads the same views.

## Capabilities and Constraints

- **Event types:** major main breaks, storm overflow events (major overflows grouped by storm day and
  catchment), low-chlorine cases (4+ weekly samples below 0.5 mg/L in a Dec–Mar summer) and leak
  alerts (from the gold layer).
- **Statuses:** Open → In review → Actioned → Closed, with owner, note and regulator-notified date, saved
  to Lakebase with an append-only history.
- **Assumption:** regulators are SA Health for drinking water and EPA SA for overflows. This is not data.

## Evidence on Hand

56 PDFs: 25 incident reports, 12 sewer overflow reports, 12 water quality notices, 6 pumping memos and
1 data guide. There are no real customers, assets or bills. Never present synthetic figures as real.

## Product Principles

1. The data suggests a status, and a person decides it.
2. Every number carries its period, unit and source; the SQL is one click away.
3. The report sits beside the record.
4. Each concept has one definition (`ARCHITECTURE.md` 5.6).
