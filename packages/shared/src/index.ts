export type DbType = 'mariadb' | 'mongodb' | 'sqlite';

export type RunMode = 'normal' | 'single' | 'uninitialized';

export interface SystemStatus {
  initialized: boolean;
  mode: RunMode;
  dbType: DbType | null;
  version: string;
  /** NAT 등 외부 접속용 공인 호스트 (없으면 UI가 브라우저 호스트 사용) */
  externalHost: string | null;
  /** 외부 포트 (없으면 각 DATAPOT 리스닝 포트 사용) */
  externalPort: number | null;
}

/** 외부(공인) 연결 정보 — NAT 포트포워딩 환경 */
export interface ExternalConnection {
  host: string;
  /** null/undefined 이면 URL에 DATAPOT 포트 사용 */
  port: number | null;
}

export interface DbConfig {
  type: DbType;
  /** Connection URL (mariadb://, mongodb://, or file path for sqlite) */
  url: string;
}

export interface UserDto {
  id: string;
  username: string;
  role: 'admin' | 'user';
  createdAt: string;
  updatedAt: string;
}

/** DATAPOT field data types */
export type PotFieldType = 'number' | 'text' | 'url' | 'date' | 'boolean' | 'type';

/** Admin-only record priority. Not part of the public pot API. */
export const POT_PRIORITIES = ['none', 'low', 'medium', 'high'] as const;
export type PotPriority = (typeof POT_PRIORITIES)[number];

export function isPotPriority(value: unknown): value is PotPriority {
  return typeof value === 'string' && (POT_PRIORITIES as readonly string[]).includes(value);
}

export const POT_FIELD_TYPE_LABELS: Record<PotFieldType, string> = {
  number: '숫자',
  text: '텍스트',
  url: 'URL',
  date: '날짜',
  boolean: '예/아니오',
  type: '구분자',
};

export interface PotField {
  /** API / JSON property key (slug from nameEn) */
  slug: string;
  /** English display name (spaces allowed) */
  nameEn: string;
  /** Korean display name */
  nameKo: string;
  type: PotFieldType;
  required: boolean;
  /** When true, JSON null is valid for this field. */
  nullable?: boolean;
}

/** JSON Schema (draft-07 subset) stored per DataPot */
export type JsonSchema = Record<string, unknown>;

export interface DataPotDto {
  id: string;
  name: string;
  /** URL path segment — /api/{key}/data */
  key: string;
  description?: string;
  /** Listening port for external CR API */
  port: number;
  /** Field definitions (source of truth for schema) */
  fields: PotField[];
  /** Generated JSON Schema for POST body validation */
  schema: JsonSchema;
  enabled: boolean;
  /** Fixed system paths */
  endpoints: {
    create: string;
    list: string;
    get: string;
    openapi: string;
    docs: string;
  };
  createdAt: string;
  updatedAt: string;
}

/** Build external API paths for a DATAPOT key */
export function buildPotApiPaths(key: string): {
  create: string;
  list: string;
  get: string;
  collection: string;
} {
  const k = key.trim();
  const collection = `/api/${k}/data`;
  return {
    create: collection,
    list: collection,
    get: `${collection}/:id`,
    collection,
  };
}

/** @deprecated use buildPotApiPaths(key) — kept for type hints only */
export const POT_API_PATHS = {
  create: '/api/{key}/data',
  list: '/api/{key}/data',
  get: '/api/{key}/data/:id',
} as const;

/** Per-pot OpenAPI publication paths (no auth) */
export const POT_OAS_PATHS = {
  openapi: '/openapi.json',
  docs: '/docs',
} as const;

export const DEFAULT_ADMIN_USERNAME = 'admin';
export const DEFAULT_ADMIN_PASSWORD = 'datapot';
export const DEFAULT_WEB_PORT = 8080;
export const APP_VERSION = '0.1.0';

/**
 * Build a JSON-safe property key from an English field name.
 * Spaces / punctuation become underscores; result is lowercase snake_case.
 */
export function slugifyFieldName(nameEn: string): string {
  const slug = nameEn
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug || 'field';
}

/**
 * Normalize DATAPOT key for URL path (/api/{key}/data).
 * Allows lowercase letters, digits, hyphen, underscore.
 */
export function normalizePotKey(raw: string): string {
  const key = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  return key || 'pot';
}

export function isValidPotKey(raw: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{0,62}$/.test(raw.trim().toLowerCase());
}

/** IPv4 (0–255 per octet) */
export function isValidIPv4(host: string): boolean {
  const parts = host.trim().split('.');
  if (parts.length !== 4) return false;
  return parts.every((p) => {
    if (!/^\d{1,3}$/.test(p)) return false;
    const n = Number(p);
    return n >= 0 && n <= 255;
  });
}

/**
 * Domain / hostname (incl. localhost).
 * Labels: alphanumerics and hyphen, not starting/ending with hyphen.
 */
export function isValidDomainName(host: string): boolean {
  const h = host.trim().toLowerCase();
  if (!h || h.length > 253) return false;
  if (h === 'localhost') return true;
  if (h.includes('..') || h.startsWith('.') || h.endsWith('.')) return false;
  const labels = h.split('.');
  if (labels.length < 1) return false;
  return labels.every((label) => {
    if (label.length < 1 || label.length > 63) return false;
    return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label);
  });
}

/** 공인 IP(IPv4) 또는 도메인 */
export function isValidExternalHost(host: string): boolean {
  const h = host.trim();
  if (!h) return false;
  return isValidIPv4(h) || isValidDomainName(h);
}

export function isValidPortNumber(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

/** Ensure unique slug within a field list */
export function uniqueSlug(base: string, existing: string[], excludeSlug?: string): string {
  const taken = new Set(existing.filter((s) => s !== excludeSlug));
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}_${i}`)) i += 1;
  return `${base}_${i}`;
}

function withNullable(
  schema: Record<string, unknown>,
  nullable: boolean | undefined,
): Record<string, unknown> {
  if (!nullable) return schema;
  const type = schema.type;
  return {
    ...schema,
    type: Array.isArray(type) ? [...type, 'null'] : [type, 'null'],
  };
}

/** OpenAPI 3.0 uses `nullable` instead of a JSON Schema null type union. */
export function toOpenApi30Schema(schema: JsonSchema): JsonSchema {
  if (!schema || typeof schema !== 'object') return schema;
  const copy: Record<string, unknown> = { ...schema };
  const properties = copy.properties;
  if (!properties || typeof properties !== 'object') return copy;
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties as Record<string, unknown>)) {
    next[key] = toOpenApi30Property(value);
  }
  copy.properties = next;
  return copy;
}

function toOpenApi30Property(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const prop = { ...(value as Record<string, unknown>) };
  if (Array.isArray(prop.type) && prop.type.includes('null')) {
    const types = prop.type.filter((item) => item !== 'null');
    prop.type = types.length === 1 ? types[0] : types;
    prop.nullable = true;
  }
  return prop;
}

export function buildJsonSchemaFromFields(fields: PotField[]): JsonSchema {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const f of fields) {
    const key = f.slug || slugifyFieldName(f.nameEn);
    const nullable = f.nullable === true;
    switch (f.type) {
      case 'number':
        properties[key] = withNullable(
          { type: 'number', description: f.nameKo || f.nameEn },
          nullable,
        );
        break;
      case 'text':
        properties[key] = withNullable(
          { type: 'string', description: f.nameKo || f.nameEn },
          nullable,
        );
        break;
      case 'url':
        properties[key] = withNullable(
          {
            type: 'string',
            format: 'uri',
            pattern: '^https?:\\/\\/\\S+$',
            description: f.nameKo || f.nameEn,
          },
          nullable,
        );
        break;
      case 'date':
        properties[key] = withNullable(
          {
            type: 'string',
            format: 'date',
            pattern: '^\\d{4}-\\d{2}-\\d{2}$',
            description: f.nameKo || f.nameEn,
          },
          nullable,
        );
        break;
      case 'boolean':
        properties[key] = withNullable(
          { type: 'boolean', description: f.nameKo || f.nameEn },
          nullable,
        );
        break;
      case 'type':
        properties[key] = withNullable(
          {
            type: 'string',
            description: f.nameKo || f.nameEn || '구분자',
          },
          nullable,
        );
        break;
      default:
        properties[key] = withNullable({ type: 'string' }, nullable);
    }
    if (f.required) required.push(key);
  }

  return {
    type: 'object',
    properties,
    ...(required.length ? { required } : {}),
    additionalProperties: false,
  };
}

/** Sample request body: slug → example value */
export function buildExamplePayloadFromFields(fields: PotField[]): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const f of fields) {
    const key = f.slug || slugifyFieldName(f.nameEn);
    switch (f.type) {
      case 'number':
        body[key] = 0;
        break;
      case 'url':
        body[key] = 'https://example.com';
        break;
      case 'date':
        body[key] = '2026-01-01';
        break;
      case 'boolean':
        body[key] = true;
        break;
      case 'type':
        body[key] = 'default';
        break;
      case 'text':
      default:
        body[key] = '';
    }
  }
  return body;
}

export type OpenApiDocument = Record<string, unknown>;

/** Build OpenAPI 3.0.3 document for one DataPot (external OAS) */
export function buildOpenApiDocument(input: {
  name: string;
  key: string;
  description?: string;
  serverUrl: string;
  fields: PotField[];
  schema?: JsonSchema;
}): OpenApiDocument {
  const dataSchema = toOpenApi30Schema(
    input.schema && input.schema.type === 'object'
      ? input.schema
      : buildJsonSchemaFromFields(input.fields),
  );
  const example = buildExamplePayloadFromFields(input.fields);
  const paths = buildPotApiPaths(input.key);
  const recordSchema = {
    type: 'object',
    properties: {
      id: { type: 'string' },
      potId: { type: 'string' },
      seq: { type: 'integer', description: 'Per-pot sequence number' },
      payload: dataSchema,
      createdAt: { type: 'string', format: 'date-time' },
    },
  };

  return {
    openapi: '3.0.3',
    info: {
      title: input.name,
      description: input.description || `DataPot external API — ${input.name}`,
      version: '1.0.0',
    },
    servers: [{ url: input.serverUrl.replace(/\/$/, '') }],
    paths: {
      [paths.collection]: {
        post: {
          summary: 'Create data',
          operationId: 'createData',
          tags: [input.name],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: dataSchema,
                example,
              },
            },
          },
          responses: {
            '201': {
              description: 'Created',
              content: { 'application/json': { schema: recordSchema } },
            },
            '400': { description: 'Schema validation failed' },
          },
        },
        get: {
          summary: 'List data',
          operationId: 'listData',
          tags: [input.name],
          responses: {
            '200': {
              description: 'OK',
              content: {
                'application/json': {
                  schema: { type: 'array', items: recordSchema },
                },
              },
            },
          },
        },
      },
      [`${paths.collection}/{id}`]: {
        get: {
          summary: 'Get data by id',
          operationId: 'getDataById',
          tags: [input.name],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'OK',
              content: { 'application/json': { schema: recordSchema } },
            },
            '404': { description: 'Not found' },
          },
        },
      },
    },
  };
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  user: UserDto;
}

export interface SetupRequest {
  dbType: DbType;
  url: string;
  adminPassword?: string;
}

/** Example connection strings shown in Setup / Settings UI */
export const DB_CONNECTION_EXAMPLES: Record<DbType, string> = {
  mariadb: 'mariadb://root:password@localhost:3306/datapot',
  mongodb: 'mongodb://localhost:27017/datapot',
  sqlite: '/var/lib/datapot/datapot.sqlite',
};

/**
 * Build public API base for a DATAPOT (scheme://host:port).
 * Prefer system external (NAT) host/port when configured.
 * - host: external host, else fallbackHost
 * - port: external port when set, else the DATAPOT listen port (1:1 NAT)
 */
export function buildPotPublicBase(opts: {
  potPort: number;
  external?: ExternalConnection | null;
  fallbackHost?: string;
  fallbackScheme?: string;
}): string {
  const scheme = (opts.fallbackScheme || 'http').replace(/:$/, '');
  const host =
    opts.external?.host?.trim() ||
    opts.fallbackHost?.trim() ||
    'localhost';
  const port =
    opts.external?.port != null && opts.external.port > 0
      ? opts.external.port
      : opts.potPort;
  return `${scheme}://${host}:${port}`;
}

export interface PotRecordDto {
  id: string;
  potId: string;
  seq: number;
  payload: Record<string, unknown>;
  createdAt: string;
  /** Admin-only. Omitted from the public pot API. */
  priority: PotPriority;
  /** Admin-only. Whether an admin has reviewed the record. */
  confirmed: boolean;
}

/** DATAPOT JSON backup / restore envelope */
export interface DatapotBackupRecord {
  seq: number;
  payload: Record<string, unknown>;
  createdAt?: string;
  priority?: PotPriority;
  confirmed?: boolean;
}

export interface DatapotBackupPot {
  name: string;
  key: string;
  description?: string;
  port: number;
  enabled: boolean;
  fields: PotField[];
  records: DatapotBackupRecord[];
}

export interface DatapotBackupFile {
  version: 1;
  exportedAt: string;
  pots: DatapotBackupPot[];
}

/** 구분자 field available for the dashboard trend chart */
export interface PotTypeFieldRef {
  slug: string;
  nameKo: string;
  nameEn: string;
}

/** Daily frequency of one 구분자 value, aligned to `dates` */
export interface PotTrendSeries {
  label: string;
  counts: number[];
}

export interface PotTrendDto {
  field: string;
  dates: string[];
  series: PotTrendSeries[];
}

/** Dashboard overview per DATAPOT */
export interface PotDailyCount {
  /** YYYY-MM-DD */
  date: string;
  count: number;
}

export interface PotOverviewDto {
  id: string;
  name: string;
  key: string;
  port: number;
  enabled: boolean;
  recordCount: number;
  /** Records an admin has not marked verified. */
  unverifiedCount: number;
  /** Oldest record time, if any. */
  firstCreatedAt: string | null;
  lastCreatedAt: string | null;
  /** Last ~6 months inclusive (oldest → newest), day keys YYYY-MM-DD */
  dailyCounts: PotDailyCount[];
  /** 구분자 columns that can drive the trend chart */
  typeFields: PotTypeFieldRef[];
}
