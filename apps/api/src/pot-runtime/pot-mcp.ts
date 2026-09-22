import { randomUUID } from 'crypto';
import { Express, Request, Response } from 'express';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { parseUtcInstant, potFieldDescription, type PotField } from '@datapot/shared';
import { DataPotRecord } from '../datapots/datapot.store';
import { PotRecordStore } from '../datapots/pot-record.store';

const PAGE_SIZE = 50;

export interface QueryHandle {
  id: string;
  potId: string;
  from: Date;
  to: Date;
  filters: Record<string, string>;
  afterSeq: number;
}

export function mountPotMcp(
  app: Express,
  pot: DataPotRecord,
  records: PotRecordStore,
  handles: Map<string, QueryHandle>,
): void {
  const onRequest = async (req: Request, res: Response) => {
    const server = createPotMcp(pot, records, handles);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      if (!res.headersSent) {
        res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
      }
    }
  };
  app.post('/mcp', (req, res) => void onRequest(req, res));
  app.get('/mcp', (req, res) => void onRequest(req, res));
  app.delete('/mcp', (req, res) => void onRequest(req, res));
}

export function dropPotHandles(handles: Map<string, QueryHandle>, potId: string): void {
  for (const [id, handle] of handles) {
    if (handle.potId === potId) handles.delete(id);
  }
}

function createPotMcp(
  pot: DataPotRecord,
  records: PotRecordStore,
  handles: Map<string, QueryHandle>,
): McpServer {
  const typeFields = (pot.fields ?? []).filter((field) => field.type === 'type');
  const fieldNotes = typeFields
    .map((field) => `${field.slug}: ${potFieldDescription(field)}`)
    .join('\n');
  const server = new McpServer(
    { name: pot.key, version: '1.0.0' },
    {
      instructions: [pot.description, fieldNotes].filter(Boolean).join('\n\n'),
    },
  );

  server.registerTool(
    'list_type_values',
    {
      description:
        '각 구분자 컬럼의 값 빈도 상위 10개. from/to는 UTC date-time이며, 주면 그 구간만 센다.',
      inputSchema: {
        from: z.string().optional().describe('UTC 시작 시각'),
        to: z.string().optional().describe('UTC 끝 시각'),
      },
    },
    async ({ from, to }) => {
      const range = parseRange(from, to, false);
      if ('error' in range) return text(range.error, true);
      const values = await records.topTypeValues(pot.id, pot.fields ?? [], range);
      return text(JSON.stringify({ fields: describeFields(typeFields), values }));
    },
  );

  server.registerTool(
    'open_query',
    {
      description:
        '수집 구간과 구분자 값으로 조회 핸들을 연다. from/to는 UTC date-time이다. 지정한 구분자만 필터가 된다.',
      inputSchema: {
        from: z.string().describe('UTC 시작 시각'),
        to: z.string().describe('UTC 끝 시각'),
        filters: z
          .record(z.string(), z.string())
          .optional()
          .describe(fieldNotes || '구분자 slug → 값'),
      },
    },
    async ({ from, to, filters }) => {
      const range = parseRange(from, to, true);
      if ('error' in range) return text(range.error, true);
      const allowed = new Set(typeFields.map((field) => field.slug));
      const nextFilters: Record<string, string> = {};
      for (const [slug, value] of Object.entries(filters ?? {})) {
        if (!allowed.has(slug)) return text(`알 수 없는 구분자: ${slug}`, true);
        const trimmed = value.trim();
        if (trimmed) nextFilters[slug] = trimmed;
      }
      const handle: QueryHandle = {
        id: randomUUID(),
        potId: pot.id,
        from: range.from!,
        to: range.to!,
        filters: nextFilters,
        afterSeq: 0,
      };
      handles.set(handle.id, handle);
      return text(JSON.stringify({ handle: handle.id }));
    },
  );

  server.registerTool(
    'read_query',
    {
      description: '열린 조회 핸들의 다음 페이지. 응답은 id, seq, payload, createdAt 이다.',
      inputSchema: {
        handle: z.string(),
      },
    },
    async ({ handle }) => {
      const open = handles.get(handle);
      if (!open || open.potId !== pot.id) return text('핸들이 없습니다', true);
      const rows = await records.queryRecords(pot.id, {
        from: open.from,
        to: open.to,
        filters: open.filters,
        afterSeq: open.afterSeq,
        limit: PAGE_SIZE,
      });
      const last = rows[rows.length - 1];
      if (last) open.afterSeq = last.seq;
      const done = rows.length < PAGE_SIZE;
      return text(
        JSON.stringify({
          items: rows.map((row) => ({
            id: row.id,
            seq: row.seq,
            payload: row.payload,
            createdAt: row.createdAt.toISOString(),
          })),
          done,
        }),
      );
    },
  );

  server.registerTool(
    'close_query',
    {
      description: '조회 핸들을 닫는다.',
      inputSchema: { handle: z.string() },
    },
    async ({ handle }) => {
      const open = handles.get(handle);
      if (open?.potId === pot.id) handles.delete(handle);
      return text(JSON.stringify({ closed: true }));
    },
  );

  return server;
}

function describeFields(fields: PotField[]): { slug: string; description: string }[] {
  return fields.map((field) => ({ slug: field.slug, description: potFieldDescription(field) }));
}

function parseRange(
  from: string | undefined,
  to: string | undefined,
  required: boolean,
): { from?: Date; to?: Date } | { error: string } {
  if (required && (!from || !to)) return { error: 'from과 to는 UTC date-time으로 필요합니다' };
  const start = from ? parseUtcInstant(from) : undefined;
  const end = to ? parseUtcInstant(to) : undefined;
  if ((from && !start) || (to && !end)) {
    return { error: 'from과 to는 UTC date-time이어야 합니다. YYYY-MM-DD는 받지 않습니다' };
  }
  return { from: start ?? undefined, to: end ?? undefined };
}

function text(body: string, isError = false) {
  return {
    content: [{ type: 'text' as const, text: body }],
    ...(isError ? { isError: true } : {}),
  };
}
