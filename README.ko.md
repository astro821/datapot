# DataPot

**Language:** [English](README.md) | 한국어

**봇이 수집한 조사·연구 데이터를 모으는 가벼운 데이터 웨어하우스 — 스키마를 정의하고, 수집 API를 공개한 뒤, 여러 봇이 같은 pot에 기록하게 합니다.**

DataPot은 OpenClaw, Grokbot 등과 같이 시장조사·수집을 자동화하는 봇·에이전트 워크플로를 위해 만들어졌습니다. 필요한 필드를 설계하면 DataPot이 HTTP API 계약을 만들고, 그 규격을 봇에게 알려 구조화된 결과를 한곳에 쌓을 수 있습니다.

> **현재:** 스키마 → API → 저장(생성/조회)과 관리 콘솔(페이지 조회, 콘솔 검색, 우선순위·검증, 대시보드 트랜드).  
> **아직 아님:** 자연어 질의, 전문 검색, MCP 공개, 풍부한 내·외부 연계 — 로드맵에 있습니다. 지금은 **단순 저장**이 중심입니다.

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
| **이후: 질의·연계** | 자연어 Q&A, 검색, **MCP**, **내·외부 데이터 연계** 계획. 현재는 구조화 저장이 핵심 |

### 일반적인 흐름

```text
1. 콘솔에서 pot 필드(스키마) 정의
2. pot 활성화 → 수집 API + OpenAPI/docs 공개
3. /api/{key}/data (및 docs)를 OpenClaw, Grokbot 등에 전달
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
| 에이전트용 MCP 서버/도구 | 계획 |
| 더 풍부한 내·외부 데이터 연계 | 계획 (단순 저장 이후) |

## 지금 DataPot이 하는 일

- **한 번 정의, 바로 서빙** — UI에서 필드 선언 → 검증 + Create/Read API 생성
- **엔드포인트 분리** — pot마다 포트·URL key (`/api/{key}/data`), 봇·게이트웨이에 넘기기 쉬움
- **콘솔 운영** — 대시보드(기여 차트, 구분자 트랜드), 활성/비활성/재구동, 페이지 단위 레코드 그리드(검색, 일괄 삭제, 상세 오프캔버스), 백업/복원
- **저장소 선택** — 데모용 SQLite, 또는 MariaDB / MongoDB

## 기능

| 영역 | 내용 |
|------|------|
| **Pots** | 이름, URL `key`, 포트, 필드 스키마, 활성/비활성/재구동 |
| **필드 타입** | number, text, url, date, boolean, type(구분자). null 허용은 스키마에 저장되고 OpenAPI `nullable`로 공개 |
| **외부 API** | `POST`/`GET` 목록, `GET` 단건; pot별 OpenAPI + docs. 응답은 payload만 — 우선순위·검증은 콘솔 전용 |
| **레코드 UI** | 서버 페이징 그리드, 푸터 검색, 다중 선택 삭제, 상세 오프캔버스. seq·우선순위·검증은 왼쪽 고정. 구분자 값은 뱃지. 우선순위·검증은 상세 패널에서만 수정 |
| **운영** | 개요 카드, pot별 기여 차트(약 6개월), 구분자 필드 트랜드(한 번에 하나), 즐겨찾기, JSON 백업/복원, 외부 host/port |
| **인증** | JWT 관리 콘솔; DBMS 미설정 시 부트스트랩 |
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

`./data` 아래 SQLite — 외부 DBMS 불필요.

```bash
pnpm install
pnpm --filter @datapot/shared build

DPOT_MODE=single \
DPOT_DATA_DIR=./data \
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

```bash
docker compose -f docker/docker-compose.single.yml up --build
```

## 외부 pot API (봇용)

| Method | Path | 설명 |
|--------|------|------|
| `POST` | `/api/{key}/data` | 생성(스키마 검증) — **봇 수집의 핵심** |
| `GET` | `/api/{key}/data` | 목록 |
| `GET` | `/api/{key}/data/:id` | 단건 |

OpenAPI(`/openapi.json`), docs(`/docs`)를 봇에 규격으로 전달하세요.

- 공개 `GET /api/{key}/data`는 `seq`가 작은 순으로 최대 **10,000**건입니다. 콘솔 그리드는 페이지 단위이며 이 한도에 묶이지 않습니다.
- 우선순위(없음/낮음/보통/높음)와 검증은 관리자 전용입니다. 인덱스가 있고 JSON 백업에 포함되며, 공개 API와 OpenAPI payload에는 없습니다.
- **null 허용**으로 저장한 필드는 JSON `null`을 받습니다. OpenAPI는 해당 속성을 `nullable`로 표시합니다. 기존 필드는 다시 저장하기 전까지 non-null입니다.
- 레코드는 pot 내부 id에 묶입니다. 이름을 바꿔도 데이터는 유지됩니다. **key**나 **port**를 바꾸면 공개 주소가 바뀌고, 다시 활성화하기 전까지 pot은 비활성입니다.

## 환경 변수

| 변수 | 설명 |
|------|------|
| `DPOT_WEB_PORT` | 관리 웹/API 포트 (기본 `8080`) |
| `DPOT_MODE` | `single` → 내장 SQLite |
| `DPOT_DATA_DIR` | 설정·SQLite 디렉터리 |
| `DPOT_ADMIN_PASSWORD` | 초기 admin 비밀번호 |
| `DPOT_DB_TYPE` | `mariadb` \| `mongodb` |
| `DPOT_DB_URL` | 연결 URL |
| `DPOT_JWT_SECRET` | JWT 시크릿 (**운영에서는 반드시 변경**) |

## 라이선스

[MIT](LICENSE) © DataPot contributors

자세한 영문 문서(CLI, RPM, Contributing 등)는 [README.md](README.md)를 참고하세요.
