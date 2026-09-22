# DataPot

**Language:** English | [한국어](README.ko.md)

**A lightweight data warehouse for bot-collected research data — define a schema, publish a collection API, and let multiple bots write into the same pot.**

DataPot is built for workflows where agents and bots (e.g. OpenClaw, Grokbot, and similar) automate market research and other collection tasks. You design the fields you care about, DataPot generates a clear HTTP API contract, and you hand that contract to one or more bots so they can push structured results into a shared store.

> **Today:** reliable schema → API → store (create / read), a per-pot MCP server, and a management console (paged records, console search, priority and verification, dashboard trends).  
> **Not yet:** natural-language query, full-text search, or rich in/out integrations — those are on the roadmap. Storage is intentionally simple for now.

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
| **MCP for agents** | Each pot exposes a stateless MCP endpoint so an agent can list type values and page through records |
| **Later: query & connect** | Natural-language Q&A, full-text search, and **internal / external** data linkage are planned; the product is still primarily a **structured store** today |

### Typical flow

```text
1. Define pot fields (schema) in the console
2. Enable the pot → collection API, OpenAPI/docs, and /mcp are published
3. Share /api/{key}/data (and docs) or the MCP URL, plus the pot Bearer token, with OpenClaw, Grokbot, … 
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
| MCP server / tools for agents | **Now** (stateless Streamable HTTP, four tools) |
| Richer internal & external data integration | Planned (beyond plain storage) |

## Why DataPot (today)

- **Define once, serve immediately** — declare fields in the UI; DataPot generates validation and a live Create / Read API.
- **Isolated endpoints** — each pot binds to its own port and URL key (`/api/{key}/data` and `/mcp`), easy to give to bots and gateways.
- **Operate from the console** — dashboard with a per-pot contribution chart and one type-field trend, enable / disable / restart, paged record grid (search, bulk delete, detail offcanvas), backup / restore.
- **Flexible storage** — MongoDB. Each pot keeps records in `data_raw_<key>`.

## Features

| Area | Capabilities |
|------|----------------|
| **Pots** | Name, URL `key`, port, field schema, enable / disable / restart |
| **Field types** | number, text, url, date, boolean, type (label / badge). Optional null is part of the schema and published as OpenAPI `nullable` |
| **External API** | `POST` / `GET` collection, `GET` by id; OpenAPI + docs per pot. Payload only — priority and verification stay in the console |
| **MCP** | Per-pot `/mcp` (Streamable HTTP): `list_type_values`, `open_query`, `read_query`, `close_query` |
| **Records UI** | Server-paged grid, footer search, multi-select delete, detail offcanvas. seq, priority, and verification are pinned; comma-separated type values render as badges. Priority and verification are edited in the detail panel |
| **Ops** | Overview cards, per-pot contribution chart (~6 months), one type-field trend at a time, favorites, JSON backup / restore, external host/port for public URLs |
| **Auth** | JWT admin console; one Bearer token per pot for the collection API and MCP (shown once; 30 / 90 / 365 days, default 30) |
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
| **Pot runtime** | One listener per enabled pot; collection API at `/api/{key}/data` and MCP at `/mcp` |
| **CLI (`dpot`)** | Status, admin password reset, and ops helpers |

## Requirements

- **Node.js** ≥ 20
- **pnpm** 9.x (`packageManager` is pinned in `package.json`)
- Optional: Docker, or `rpmbuild` (for Linux RPM packages)

## Quick start

### Local development (single mode)

MongoDB is required. Single mode only changes where `config.json` lives.

```bash
pnpm install
pnpm --filter @datapot/shared build

# Terminal 1 — API
DPOT_MODE=single \
DPOT_DATA_DIR=./data \
DPOT_DB_TYPE=mongodb \
DPOT_DB_URL=mongodb://localhost:27017/datapot \
DPOT_ADMIN_PASSWORD=datapot \
pnpm --filter @datapot/api run dev

# Terminal 2 — Web
pnpm --filter @datapot/web run dev
```

Or run both with:

```bash
DPOT_MODE=single DPOT_DATA_DIR=./data DPOT_DB_TYPE=mongodb DPOT_DB_URL=mongodb://localhost:27017/datapot DPOT_ADMIN_PASSWORD=datapot pnpm dev
```

| Service | URL |
|---------|-----|
| Web UI | http://localhost:5173 (`#/` HashRouter) |
| Admin API | http://localhost:8080/api |
| Default login | `admin` / `datapot` (or your `DPOT_ADMIN_PASSWORD`) |

### Docker (single mode)

Compose runs DataPot only. Set `DPOT_DB_URL` to a separate MongoDB before starting. `docker/.env` is loaded automatically (see `docker/.env.example`).

```bash
# MongoDB on the Docker host
export DPOT_DB_URL=mongodb://host.docker.internal:27017/datapot

docker compose -f docker/docker-compose.single.yml up --build
```

- Console: http://localhost:8080  
- Pot ports: `9001–9010` (mapped in compose)  
- Data volume: `dpot-data` → `/data`  
- Database: the server in `DPOT_DB_URL` (not a container in this compose file)

GitHub Actions (`.github/workflows/docker-publish.yml`) can publish images to GHCR.

## Runtime modes

| Mode | How | Database |
|------|-----|----------|
| **Uninitialized** | No DBMS configured | None — setup UI only |
| **Normal** | `DPOT_DB_URL`, or Settings UI | MongoDB |
| **Single** | `DPOT_MODE=single` or `single` process arg | MongoDB. Config file is `/data/config.json` when `DPOT_DATA_DIR` is unset, otherwise under that directory |

Changing DBMS connection from Settings reloads the app and requires re-login (bootstrap admin may apply when the DB is empty).

## External pot API (for bots)

Each pot exposes:

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/{key}/data` | Create (schema-validated) — **primary bot ingest** |
| `GET` | `/api/{key}/data` | List |
| `GET` | `/api/{key}/data/:id` | Get one |

Also published per pot: OpenAPI (`/openapi.json`) and docs (`/docs`) — use these when instructing bots what to send.

The collection routes and `/mcp` require the pot Bearer token (`Authorization: Bearer …`). `/health`, `/openapi.json`, and `/docs` do not. The console issues one active token per pot, stores only its SHA-256 hash, and shows the plaintext once. Reissuing a token invalidates the previous one immediately. A missing or expired token returns 401.

### MCP

Each enabled pot serves a stateless [Streamable HTTP](https://modelcontextprotocol.io/) endpoint at `/mcp` (`POST`, `GET`, `DELETE`) on that pot's port. The server name is the pot key. Instructions include the pot description and the type-field notes.

| Tool | Behavior |
|------|----------|
| `list_type_values` | Top 10 values for each type field. Optional `from` / `to` are UTC date-times. A bare `YYYY-MM-DD` is rejected. |
| `open_query` | Open a handle for a required UTC range and optional type-field filters. Returns `{ handle, afterSeq: 0 }`. At most 8 open handles per pot. A handle closes after 15 minutes without a read. |
| `read_query` | One page of 50 records. Pass the previous response's `afterSeq` on the next call; retry the same `afterSeq` if the response was lost. Items are `id`, `seq`, `payload`, `createdAt`. `done` is true on the last page. |
| `close_query` | Close the handle. |

**Notes**

- Records are stored by internal pot id — renaming a pot does **not** drop data.
- Public `GET /api/{key}/data` returns at most **10,000** records, lowest `seq` first. The console grid is paged and is not limited to that slice.
- Priority (none / low / medium / high) and verification are admin-only. They are indexed, included in JSON backup, and omitted from the public API and OpenAPI payload.
- A field saved with **allow null** accepts JSON `null`. OpenAPI marks that property `nullable`. Existing fields stay non-null until you save them again.
- **key** is fixed at creation. Changing **port** updates the public endpoint and **disables** the pot until you enable it again.
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
| `DPOT_MODE` | `single` uses `/data/config.json` when `DPOT_DATA_DIR` is unset |
| `DPOT_DATA_DIR` | Config directory |
| `DPOT_ADMIN_PASSWORD` | Initial admin password (single / bootstrap) |
| `DPOT_DB_TYPE` | `mongodb` |
| `DPOT_DB_URL` | MongoDB connection URL |
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

Contributions are welcome — especially around bot integrations, query, and search.

1. Fork and create a feature branch  
2. Make your change with a clear purpose  
3. Run builds / relevant checks locally  
4. Open a pull request describing **why** and how to test  

Bug reports and feature ideas via Issues are appreciated. Please do not include production secrets or private infrastructure details in public tickets.

## Security

- Change `DPOT_JWT_SECRET` and admin passwords before any shared or production deployment.
- The collection API and `/mcp` require the pot Bearer token. `/health`, OpenAPI, and docs stay open so a client can tell a blocked port from a 401.
- Report security issues privately to the maintainers when possible, rather than filing a public issue with exploit details.

## License

[MIT](LICENSE) © DataPot contributors
