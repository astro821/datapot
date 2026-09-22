# DataPot

**Language:** [English](README.md) | 한국어

**봇이 수집한 조사·연구 데이터를 모으는 가벼운 데이터 웨어하우스 — 스키마를 정의하고, 수집 API를 공개한 뒤, 여러 봇이 같은 pot에 기록하게 합니다.**

DataPot은 OpenClaw, Grokbot 등과 같이 시장조사·수집을 자동화하는 봇·에이전트 워크플로를 위해 만들어졌습니다. 필요한 필드를 설계하면 DataPot이 HTTP API 계약을 만들고, 그 규격을 봇에게 알려 구조화된 결과를 한곳에 쌓을 수 있습니다.

> **현재:** 스키마 → API → 저장(생성/조회), 팟별 MCP, 관리 콘솔(페이지 조회, 콘솔 검색, 우선순위·검증, 대시보드 트랜드).  
> **아직 아님:** 자연어 질의, 전문 검색, 풍부한 내·외부 연계 — 로드맵에 있습니다. 지금은 **단순 저장**이 중심입니다.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-9.x-orange)](https://pnpm.io/)

---

## 비전

| 개념 | 의미 |
|------|------|
| **봇 데이터 웨어하우스** | 시장조사·스크랩·모니터링 등 **봇이 만든 데이터를 모아 관리**하는 곳 |
| **멀티 봇 수집** | 여러 봇이 **같은 pot**(같은 스키마·API)에 기록 → 한 데이터셋으로 합쳐짐 |
| **스키마 → API → 봇** | 수집 스키마를 먼저 정의 → DataPot이 **API 규격 공개** → 봇에게 알려 **일관된 형태로 수집** |
| **에이전트용 MCP** | 팟마다 무상태 MCP가 있어 구분자 값을 보고 레코드를 페이지 단위로 읽는다 |
| **이후: 질의·연계** | 자연어 Q&A, 전문 검색, **내·외부 데이터 연계** 계획. 현재는 구조화 저장이 핵심 |

### 일반적인 흐름

```text
1. 콘솔에서 pot 필드(스키마) 정의
2. pot 활성화 → 수집 API, OpenAPI/docs, /mcp 공개
3. /api/{key}/data (및 docs) 또는 MCP URL과 팟 Bearer 토큰을 OpenClaw, Grokbot 등에 전달
4. 봇이 POST로 기록 → 운영자는 UI에서 조회·검색·우선순위/검증·삭제·백업
```

## 로드맵 (마일스톤)

| 마일스톤 | 상태 |
|----------|------|
| 스키마 기반 pot + pot별 CR API + 콘솔 | **현재** |
| 공유 pot에 대한 멀티 봇 수집 | **현재** (동일 API, 다수 클라이언트) |
| pot 데이터 자연어 질의 | 계획 |
| 콘솔에서 수집 레코드 검색 | **현재** (부분 문자열, 전체 페이지) |
| 전문 검색 | 계획 |
| 에이전트용 MCP 서버/도구 | **현재** (무상태 Streamable HTTP, 도구 4개) |
| 더 풍부한 내·외부 데이터 연계 | 계획 (단순 저장 이후) |

## 지금 DataPot이 하는 일

- **한 번 정의, 바로 서빙** — UI에서 필드 선언 → 검증 + Create/Read API 생성
- **엔드포인트 분리** — pot마다 포트·URL key (`/api/{key}/data`, `/mcp`), 봇·게이트웨이에 넘기기 쉬움
- **콘솔 운영** — 대시보드(기여 차트, 구분자 트랜드), 활성/비활성/재구동, 페이지 단위 레코드 그리드(검색, 일괄 삭제, 상세 오프캔버스), 백업/복원
- **저장소** — MongoDB. pot마다 레코드는 `data_raw_<key>` 컬렉션이다.

## 기능

| 영역 | 내용 |
|------|------|
| **Pots** | 이름, URL `key`, 포트, 필드 스키마, 활성/비활성/재구동 |
| **필드 타입** | number, text, url, date, boolean, type(구분자). null 허용은 스키마에 저장되고 OpenAPI `nullable`로 공개 |
| **외부 API** | `POST`/`GET` 목록, `GET` 단건; pot별 OpenAPI + docs. 응답은 payload만 — 우선순위·검증은 콘솔 전용 |
| **MCP** | 팟별 `/mcp` (Streamable HTTP): `list_type_values`, `open_query`, `read_query`, `close_query` |
| **레코드 UI** | 서버 페이징 그리드, 푸터 검색, 다중 선택 삭제, 상세 오프캔버스. seq·우선순위·검증은 왼쪽 고정. 구분자 값은 뱃지. 우선순위·검증은 상세 패널에서만 수정 |
| **운영** | 개요 카드, pot별 기여 차트(약 6개월), 구분자 필드 트랜드(한 번에 하나), 즐겨찾기, JSON 백업/복원, 외부 host/port |
| **인증** | JWT 관리 콘솔. 수집 API와 MCP는 팟당 Bearer 토큰 하나(한 번만 표시, 30/90/365일, 기본 30일) |
| **언어** | 영어(기본) / 한국어 — **시스템 관리 → 언어 설정** |

## 아키텍처

```
datapot/
├── apps/
│   ├── api/          # NestJS — 관리 API + pot 런타임(포트별 Express)
│   └── web/          # React SPA (Vite, HashRouter)
├── packages/
│   ├── shared/       # 공통 타입, 경로 헬퍼, OpenAPI 빌더
│   └── cli/          # `dpot` CLI
├── docker/           # Dockerfile + compose (single 모드)
├── rpm/              # 자체 포함 RPM 패키징
└── scripts/          # 빌드·배포 헬퍼
```

## 요구 사항

- **Node.js** ≥ 20
- **pnpm** 9.x
- 선택: Docker, 또는 `rpmbuild`(Linux RPM)

## 빠른 시작

### 로컬 (single 모드)

MongoDB가 필요하다. single 모드는 설정 파일 위치만 다르다.

```bash
pnpm install
pnpm --filter @datapot/shared build

DPOT_MODE=single \
DPOT_DATA_DIR=./data \
DPOT_DB_TYPE=mongodb \
DPOT_DB_URL=mongodb://localhost:27017/datapot \
DPOT_ADMIN_PASSWORD=datapot \
pnpm --filter @datapot/api run dev

# 다른 터미널
pnpm --filter @datapot/web run dev
```

| 서비스 | URL |
|--------|-----|
| 웹 UI | http://localhost:5173 (`#/` HashRouter) |
| 관리 API | http://localhost:8080/api |
| 기본 로그인 | `admin` / `datapot` (또는 `DPOT_ADMIN_PASSWORD`) |

### Docker (single)

Compose는 DataPot만 띄운다. 시작 전에 `DPOT_DB_URL`로 별도 MongoDB를 지정한다. `docker/.env`를 두면 자동으로 읽는다 (`docker/.env.example` 참고).

```bash
# Docker 호스트에서 도는 MongoDB
export DPOT_DB_URL=mongodb://host.docker.internal:27017/datapot

docker compose -f docker/docker-compose.single.yml up --build
```

## 외부 pot API (봇용)

| Method | Path | 설명 |
|--------|------|------|
| `POST` | `/api/{key}/data` | 생성(스키마 검증) — **봇 수집의 핵심** |
| `GET` | `/api/{key}/data` | 목록 |
| `GET` | `/api/{key}/data/:id` | 단건 |

OpenAPI(`/openapi.json`), docs(`/docs`)를 봇에 규격으로 전달하세요.

수집 API와 `/mcp`는 팟 Bearer 토큰(`Authorization: Bearer …`)이 필요합니다. `/health`, `/openapi.json`, `/docs`는 토큰 없이 열립니다. 콘솔은 팟마다 활성 토큰 하나만 두고, SHA-256 해시만 저장하며, 평문은 발급 때 한 번만 보여 줍니다. 다시 발급하면 이전 토큰은 바로 무효가 되고, 토큰이 없거나 만료되면 401입니다.

### MCP

활성화된 팟은 자기 포트의 `/mcp`에서 무상태 Streamable HTTP MCP를 제공합니다 (`POST`, `GET`, `DELETE`). 서버 이름은 팟 key이고, 안내문에는 팟 설명과 구분자 필드 설명이 들어갑니다.

| 도구 | 동작 |
|------|------|
| `list_type_values` | 구분자 필드별 값 빈도 상위 10개. `from`/`to`는 선택이며 UTC date-time이다. `YYYY-MM-DD`만 넘기면 거절한다. |
| `open_query` | UTC 구간(필수)과 구분자 필터로 핸들을 연다. `{ handle, afterSeq: 0 }`. 팟당 핸들은 8개까지이고, 15분 동안 읽지 않으면 닫힌다. |
| `read_query` | 50건씩 읽는다. 응답의 `afterSeq`를 다음 호출에 넘긴다. 응답을 못 받았으면 같은 `afterSeq`로 다시 호출한다. 항목은 `id`, `seq`, `payload`, `createdAt`이다. 마지막 페이지면 `done`이 true다. |
| `close_query` | 핸들을 닫는다. |

- 공개 `GET /api/{key}/data`는 `seq`가 작은 순으로 최대 **10,000**건입니다. 콘솔 그리드는 페이지 단위이며 이 한도에 묶이지 않습니다.
- 우선순위(없음/낮음/보통/높음)와 검증은 관리자 전용입니다. 인덱스가 있고 JSON 백업에 포함되며, 공개 API와 OpenAPI payload에는 없습니다.
- **null 허용**으로 저장한 필드는 JSON `null`을 받습니다. OpenAPI는 해당 속성을 `nullable`로 표시합니다. 기존 필드는 다시 저장하기 전까지 non-null입니다.
- 레코드는 pot 내부 id에 묶입니다. 이름을 바꿔도 데이터는 유지됩니다. **key**는 생성 후에 바꿀 수 없습니다. **port**를 바꾸면 공개 주소가 바뀌고, 다시 활성화하기 전까지 pot은 비활성입니다.

## 환경 변수

| 변수 | 설명 |
|------|------|
| `DPOT_WEB_PORT` | 관리 웹/API 포트 (기본 `8080`) |
| `DPOT_MODE` | `single` 이고 `DPOT_DATA_DIR`이 없으면 `/data/config.json` |
| `DPOT_DATA_DIR` | 설정 디렉터리 |
| `DPOT_ADMIN_PASSWORD` | 초기 admin 비밀번호 |
| `DPOT_DB_TYPE` | `mongodb` |
| `DPOT_DB_URL` | MongoDB 연결 URL |
| `DPOT_JWT_SECRET` | JWT 시크릿 (**운영에서는 반드시 변경**) |

## 라이선스

[MIT](LICENSE) © DataPot contributors

자세한 영문 문서(CLI, RPM, Contributing 등)는 [README.md](README.md)를 참고하세요.
