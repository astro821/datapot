# DataPot

**Language:** English | [한국어](README.ko.md)

**A lightweight data warehouse for bot-collected research data — define a schema, publish a collection API, and let multiple bots write into the same pot.**

DataPot is built for workflows where agents and bots (e.g. OpenClaw, Grokbot, and similar) automate market research and other collection tasks. You design the fields you care about, DataPot generates a clear HTTP API contract, and you hand that contract to one or more bots so they can push structured results into a shared store.

> **Today:** reliable schema → API → store (create / read), plus a management console (paged records, console search, priority and verification, dashboard trends).  
> **Not yet:** natural-language query, full-text search, MCP surface, or rich in/out integrations — those are on the roadmap. Storage is intentionally simple for now.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-9.x-orange)](https://pnpm.io/)

---

## Vision

| Idea | Meaning |
|------|---------|
| **Bot data warehouse** | A place to **collect and manage** data produced by automated bots (market research, scrapes, monitors, etc.) |
| **Multi-bot ingest** | Many bots can target the **same pot** (same schema + API), so results from different agents land in one dataset |
| **Schema → API → bots** | You define the collection schema first; DataPot **publishes the API spec**; you **tell bots that contract** so they collect in a consistent shape |
| **Later: query & connect** | Natural-language Q&A, search, **MCP** exposure, and **internal / external** data linkage are planned; the product is still primarily a **structured store** today |

### Typical flow

```text
1. Define pot fields (schema) in the console
2. Enable the pot → collection API + OpenAPI/docs are published
3. Share /api/{key}/data (and docs) with OpenClaw, Grokbot, … 
4. Bots POST structured records; operators browse, search, set priority / verification, delete, and backup in the UI
```

## Roadmap (milestones)

| Milestone | Status |
|-----------|--------|
| Schema-defined pots + per-pot CR API + console | **Now** |
| Multi-bot ingest into shared pots | **Now** (same API, many clients) |
| Natural-language query over pot data | Planned |
| Console search over collected records | **Now** (substring match, all pages) |
| Full-text search | Planned |
| MCP server / tools for agents | Planned |
| Richer internal & external data integration | Planned (beyond plain storage) |

## Why DataPot (today)

- **Define once, serve immediately** — declare fields in the UI; DataPot generates validation and a live Create / Read API.
- **Isolated endpoints** — each pot binds to its own port and URL key (`/api/{key}/data`), easy to give to bots and gateways.
- **Operate from the console** — dashboard with a per-pot contribution chart and one type-field trend, enable / disable / restart, paged record grid (search, bulk delete, detail offcanvas), backup / restore.
- **Flexible storage** — SQLite for single-node demos, or MariaDB / MongoDB for longer-lived deployments.

## Features

| Area | Capabilities |
|------|----------------|
| **Pots** | Name, URL `key`, port, field schema, enable / disable / restart |
| **Field types** | number, text, url, date, boolean, type (label / badge). Optional null is part of the schema and published as OpenAPI `nullable` |
| **External API** | `POST` / `GET` collection, `GET` by id; OpenAPI + docs per pot. Payload only — priority and verification stay in the console |
| **Records UI** | Server-paged grid, footer search, multi-select delete, detail offcanvas. seq, priority, and verification are pinned; comma-separated type values render as badges. Priority and verification are edited in the detail panel |
| **Ops** | Overview cards, per-pot contribution chart (~6 months), one type-field trend at a time, favorites, JSON backup / restore, external host/port for public URLs |
| **Auth** | JWT admin console; bootstrap setup when DBMS is not configured yet |
| **i18n** | English (default) / Korean — **System settings → Language** |

## Architecture

```
datapot/
├── apps/
│   ├── api/          # NestJS — admin API + pot runtime (per-port Express)
│   └── web/          # React SPA (Vite, HashRouter)
├── packages/
│   ├── shared/       # Shared types, path helpers, OpenAPI builders
│   └── cli/          # `dpot` CLI
├── docker/           # Dockerfile + compose (single mode)
├── rpm/              # Self-contained RPM packaging
└── scripts/          # Build & deploy helpers
```

| Component | Role |
|-----------|------|
| **Web console** | Manage pots, fields, users, settings, and records |
| **Admin API** | Authenticated REST under `/api/*` (default port `8080`) |
| **Pot runtime** | One listener per enabled pot; public CR API at `/api/{key}/data` |
| **CLI (`dpot`)** | Status, admin password reset, and ops helpers |

## Requirements

- **Node.js** ≥ 20
- **pnpm** 9.x (`packageManager` is pinned in `package.json`)
- Optional: Docker, or `rpmbuild` (for Linux RPM packages)

## Quick start

### Local development (single mode)

SQLite under `./data` — no external DBMS required.

```bash
pnpm install
pnpm --filter @datapot/shared build

# Terminal 1 — API
DPOT_MODE=single \
DPOT_DATA_DIR=./data \
DPOT_ADMIN_PASSWORD=datapot \
pnpm --filter @datapot/api run dev

# Terminal 2 — Web
pnpm --filter @datapot/web run dev
```

Or run both with:

```bash
DPOT_MODE=single DPOT_DATA_DIR=./data DPOT_ADMIN_PASSWORD=datapot pnpm dev
```

| Service | URL |
|---------|-----|
| Web UI | http://localhost:5173 (`#/` HashRouter) |
| Admin API | http://localhost:8080/api |
| Default login | `admin` / `datapot` (or your `DPOT_ADMIN_PASSWORD`) |

### Docker (single mode)

```bash
docker compose -f docker/docker-compose.single.yml up --build
```

- Console: http://localhost:8080  
- Pot ports: `9001–9010` (mapped in compose)  
- Data volume: `dpot-data` → `/data`

GitHub Actions (`.github/workflows/docker-publish.yml`) can publish images to GHCR.

## Runtime modes

| Mode | How | Database |
|------|-----|----------|
| **Uninitialized** | No DBMS configured | None — setup UI only |
| **Normal** | `DPOT_DB_TYPE` + `DPOT_DB_URL`, or Settings UI | MariaDB or MongoDB |
| **Single** | `DPOT_MODE=single` or `single` process arg | SQLite in `DPOT_DATA_DIR` |

Changing DBMS connection from Settings reloads the app and requires re-login (bootstrap admin may apply when the DB is empty).

## External pot API (for bots)

Each pot exposes:

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/{key}/data` | Create (schema-validated) — **primary bot ingest** |
| `GET` | `/api/{key}/data` | List |
| `GET` | `/api/{key}/data/:id` | Get one |

Also published per pot: OpenAPI (`/openapi.json`) and docs (`/docs`) — use these when instructing bots what to send.

**Notes**

- Records are stored by internal pot id — renaming a pot does **not** drop data.
- Public `GET /api/{key}/data` returns at most **10,000** records, lowest `seq` first. The console grid is paged and is not limited to that slice.
- Priority (none / low / medium / high) and verification are admin-only. They are indexed, included in JSON backup, and omitted from the public API and OpenAPI payload.
- A field saved with **allow null** accepts JSON `null`. OpenAPI marks that property `nullable`. Existing fields stay non-null until you save them again.
- Changing **key** or **port** updates the public endpoint and **disables** the pot until you enable it again.
- Configure **external host / port** in Settings so console-copied URLs match your NAT or reverse proxy.
- Protect pot endpoints (network policy, reverse proxy, gateway) when bots run outside a trusted network.

## CLI

```bash
# From repo
pnpm dpot status
pnpm dpot admin reset-password --user admin --password 'new-secret'

# In Docker / RPM install
dpot status
dpot admin reset-password --password 'new-secret'
```

## Environment variables

| Variable | Description |
|----------|-------------|
| `DPOT_WEB_PORT` | Admin web + API port (default `8080`) |
| `DPOT_MODE` | Set to `single` for embedded SQLite |
| `DPOT_DATA_DIR` | Config + SQLite directory |
| `DPOT_ADMIN_PASSWORD` | Initial admin password (single / bootstrap) |
| `DPOT_DB_TYPE` | `mariadb` \| `mongodb` |
| `DPOT_DB_URL` | Connection URL |
| `DPOT_JWT_SECRET` | JWT signing secret (**change in production**) |

## Packaging (RPM)

Linux x86_64 / arm64 builds can produce a **self-contained** RPM (bundles Node.js + production deps):

```bash
./scripts/rpm-build.sh
```

Optional remote helper (host via env — do not commit private deploy hosts):

```bash
DPOT_DEPLOY_HOST=user@your-build-host ./scripts/rpm-remote-deploy.sh
```

See `rpm/datapot.spec` and `scripts/` for details.

## Development

```bash
pnpm install
pnpm build                 # all packages
pnpm --filter @datapot/api run dev
pnpm --filter @datapot/web run dev
```

### Project conventions

- Shared contracts live in `@datapot/shared` — prefer importing types and path helpers from there.
- Pot public paths are always `/api/{key}/…` (not a global `/v1`).
- Prefer small, focused PRs; keep secrets and private infrastructure out of the repo (see `.cursor/rules/open-source.mdc`).

## Contributing

Contributions are welcome — especially around bot integrations, query/search, and MCP.

1. Fork and create a feature branch  
2. Make your change with a clear purpose  
3. Run builds / relevant checks locally  
4. Open a pull request describing **why** and how to test  

Bug reports and feature ideas via Issues are appreciated. Please do not include production secrets or private infrastructure details in public tickets.

## Security

- Change `DPOT_JWT_SECRET` and admin passwords before any shared or production deployment.
- Pot APIs are intentionally open CR endpoints for bot ingest — protect them when exposing beyond a trusted network.
- Report security issues privately to the maintainers when possible, rather than filing a public issue with exploit details.

## License

[MIT](LICENSE) © DataPot contributors
