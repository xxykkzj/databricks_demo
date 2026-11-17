# water-incident-desk ✨

> A modern full-stack application built with [`apx`](https://github.com/databricks-solutions/apx) 🚀

## 🛠️ Tech Stack

This application leverages a powerful, modern tech stack:

- **Backend** 🐍 Python + [FastAPI](https://fastapi.tiangolo.com/)
- **Frontend** ⚛️ React + [shadcn/ui](https://ui.shadcn.com/)
- **API Client** 🔄 Auto-generated TypeScript client from OpenAPI schema

## 🚀 Quick Start

### Development Mode

Start all development servers (backend, frontend, and OpenAPI watcher) in detached mode:

```bash
apx dev start
```

This will start an apx development server, which in it's turn runs backend, frontend and OpenAPI watcher.
All servers run in the background, with logs kept in-memory of the apx dev server.

### 📊 Monitoring & Logs

```bash
# View all logs
apx dev logs

# Stream logs in real-time
apx dev logs -f

# Check server status
apx dev status

# Stop all servers
apx dev stop
```

## ✅ Code Quality

Run type checking and linting for both TypeScript and Python:

```bash
apx dev check
```

## 📦 Build

Create a production-ready build:

```bash
apx build
```

## 🚢 Deployment

Deploy to Databricks:

```bash
databricks bundle deploy -p <your-profile>
```

---

<p align="center">Built with ❤️ using <a href="https://github.com/databricks-solutions/apx">apx</a></p>

_What this is for:_ one desk for a water utility's major events (main breaks, storm overflows, low-chlorine cases, leak alerts): see what is open, read the report PDF beside the record, and save a status with history.

_Live URL:_ https://water-incident-desk-7474647348149750.aws.databricksapps.com

<!-- workshop-brief:v1 -->
## Workshop brief

- Original request: a dashboard, interaction to update status, and display of the PDFs landed in `/Volumes/workshop_demo/water_utilities/raw`, after a full data deep-dive and a proposal.
- First version and primary action: register of 173 major events (breaks, storm overflows, chlorine cases, leak alert) with a suggested status, PDF viewer, dashboard and documents library. Primary action: save a status (owner, note, regulator date) to Lakebase. Design and decisions D1–D15 are in `ARCHITECTURE.md`.
- Stated facts: Genie One is the attendee's business-context chat; Genie Code was retired (D13); this design wins where definitions disagree (D10).
- Demo assumptions: synthetic data to 12 Nov 2026; the regulators (SA Health, EPA SA) are assumed; leak loss is an estimate; gold's pipe-risk tier counts the break it labels.
- Checks: views C1–C9 pass (`docs/de-report.md`); typecheck and build pass; the deployed app renders as the attendee with Lakebase connected. Not yet observed: a saved status round-trip in the deployed app. Gold column comments are blocked on pipeline permission (D14).
<!-- /workshop-brief -->
