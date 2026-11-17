# Design: Incident & Report Desk

Recorded from the shipped build (2026-11-17). Mode: **Operate**. Direction: a calm operations
console, with a dense register, each record and its PDF side by side, neutral surfaces and one restrained colour
scale for status.

## World

- **Scene:** an office desk in daylight, document-heavy. That is why **light is the default**. Dark is tuned
  separately (`.dark` in `styles/globals.css`), not inverted.
- **Neutrals:** tinted towards the deep ink-teal of the workshop roles. Text is `#0b2026`; the page is `#f6f8f8`
  and panels are `#ffffff`.
- **No decoration.** Colour does jobs: event-type identity and workflow status.

## Tokens (`styles/globals.css`)

| Role | Light | Dark |
|---|---|---|
| background / card | `#f6f8f8` / `#ffffff` | `#0b1417` / `#111d21` |
| foreground / muted-foreground | `#0b2026` / `#4a5a60` | `#e4ebed` / `#a6b4b9` |
| border (hairline) / input (3:1 outline) | `#d6dee0` / `#7c8b91` | `#22343a` / `#6b7f86` |
| ring (focus) | `#1f5fd6` | `#77a6f7` |
| series 1–4 (break, storm, chlorine, leak) | `#2a78d6` `#eb6834` `#1baf7a` `#eda100` | `#3987e5` `#d95926` `#199e70` `#c98500` |
| status open / review / actioned / closed | `#b45a00` `#1f5fd6` `#6d4bc4` `#1b6e3a` | `#f0a04b` `#77a6f7` `#b39cf2` `#57c27f` |

- **Validation:** the categorical palette passes the dataviz validator in both modes (adjacent CVD ΔE ≥ 8.4).
  In light mode, aqua and yellow are below 3:1 on white, so the charts always carry a legend with counts and a
  table view.
- **Contrast:** the text pairs measure 4.7:1 or better in both themes.

## Type

- **Family:** the system UI stack only. Base size 14px.
- **Scale:** headings 15px (section) and 18–20px (page), semibold.
- **Figures:** `tabular-nums` on tables, axis ticks and counts.
- **Mono:** only for SQL and paths.

## Components

- **TypeChip:** a 20px rounded square in the type colour with a white lucide icon, then the short label.
- **StatusBadge:** icon + label + colour, never colour alone. A **dashed outline with "· suggested"**
  means the data suggests the status; a filled tint means a person saved it.
- **ShowQuery:** a `<details>` disclosure holding every SQL statement behind a panel.
- **QueryBoundary:** Suspense with skeletons, plus an error panel that names the failure and offers retry.
- **PdfViewer:** PDF.js renders onto canvases fitted to the panel width, with "Open" as the fallback to the browser
  viewer.
- **Charts** (SVG, `components/desk/charts.tsx`):
  - 2px lines and 2px surface gaps between stacked fills;
  - 4px rounded data ends;
  - hairline grids and one y-axis;
  - hover tooltips;
  - a table toggle on every chart.

## Layout

- **Dashboard:** follows the analytical reference. A summary table by type is the overview, not hero
  metrics, followed by a monthly trend and open-by-region charts.
- **Register:** follows the queue-detail reference.
  - The list starts in the first viewport, ordered open first, with the reason in words on each row.
  - The detail panel is sticky beside the list.
  - Filters, sort and the selected event live in the URL.
- **Documents:** the live volume list, with the viewer beside it.

## Motion

Hover and selection washes only, in 150–200 ms. Nothing orchestrated.
