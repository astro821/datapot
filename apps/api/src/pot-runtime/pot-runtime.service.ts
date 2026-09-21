import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import express, { Express, Request, Response } from 'express';
import { Server } from 'http';
import Ajv, { ValidateFunction } from 'ajv';
import { buildOpenApiDocument, buildPotApiPaths, buildPotPublicBase, POT_OAS_PATHS } from '@datapot/shared';
import { DataPotStore, DataPotRecord } from '../datapots/datapot.store';
import { PotRecordStore } from '../datapots/pot-record.store';
import { BootstrapService } from '../bootstrap/bootstrap.service';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function swaggerUiHtml(title: string): string {
  const safe = escapeHtml(title);
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safe} — OpenAPI</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui.css" />
  <style>body{margin:0} .topbar{display:none}</style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui-bundle.js" crossorigin></script>
  <script>
    window.ui = SwaggerUIBundle({
      url: '${POT_OAS_PATHS.openapi}',
      dom_id: '#swagger-ui',
      deepLinking: true,
      presets: [SwaggerUIBundle.presets.apis],
      layout: 'BaseLayout'
    });
  </script>
</body>
</html>`;
}

@Injectable()
export class PotRuntimeService implements OnModuleDestroy {
  private readonly logger = new Logger(PotRuntimeService.name);
  private readonly servers = new Map<string, Server>();
  private readonly ajv = new Ajv({ allErrors: true, coerceTypes: false });

  constructor(
    private readonly pots: DataPotStore,
    private readonly records: PotRecordStore,
    private readonly bootstrap: BootstrapService,
  ) {}

  async onModuleDestroy(): Promise<void> {
    await this.stopAll();
  }

  async reloadAll(): Promise<void> {
    await this.stopAll();
    const all = await this.pots.findAll();
    for (const pot of all) {
      if (pot.enabled) {
        await this.startPot(pot);
      }
    }
  }

  async startPot(pot: DataPotRecord): Promise<void> {
    await this.stopPot(pot.id);
    if (!pot.enabled) return;

    const app = this.buildApp(pot);
    const server = await new Promise<Server>((resolve, reject) => {
      const s = app.listen(pot.port, () => resolve(s));
      s.on('error', reject);
    }).catch((err: NodeJS.ErrnoException) => {
      this.logger.error(`Failed to bind DataPot ${pot.name} on :${pot.port}: ${err.message}`);
      throw err;
    });

    this.servers.set(pot.id, server);
    this.logger.log(`DataPot "${pot.name}" listening on :${pot.port}`);
  }

  async restartPot(pot: DataPotRecord): Promise<void> {
    await this.stopPot(pot.id);
    if (pot.enabled) await this.startPot(pot);
  }

  async stopPot(id: string): Promise<void> {
    const server = this.servers.get(id);
    if (!server) return;
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    this.servers.delete(id);
  }

  async stopAll(): Promise<void> {
    const ids = [...this.servers.keys()];
    for (const id of ids) {
      await this.stopPot(id);
    }
  }

  private buildApp(pot: DataPotRecord): Express {
    const app = express();
    app.use(express.json({ limit: '2mb' }));
    app.use((_req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      next();
    });
    app.options('*', (_req, res) => {
      res.sendStatus(204);
    });

    let validate: ValidateFunction | null = null;
    try {
      validate = this.ajv.compile(pot.schema || { type: 'object' });
    } catch {
      this.logger.warn(`Invalid schema for pot ${pot.id}; accepting any object`);
    }

    app.get('/health', (_req, res) => {
      res.json({ ok: true, potId: pot.id, name: pot.name });
    });

    app.get(POT_OAS_PATHS.openapi, (req: Request, res: Response) => {
      const ext = this.bootstrap.config.external;
      let serverUrl: string;
      if (ext?.host) {
        const proto =
          (typeof req.headers['x-forwarded-proto'] === 'string'
            ? req.headers['x-forwarded-proto'].split(',')[0].trim()
            : null) ||
          req.protocol ||
          'http';
        serverUrl = buildPotPublicBase({
          potPort: pot.port,
          external: ext,
          fallbackScheme: proto,
        });
      } else {
        const proto =
          (typeof req.headers['x-forwarded-proto'] === 'string'
            ? req.headers['x-forwarded-proto'].split(',')[0].trim()
            : null) ||
          req.protocol ||
          'http';
        const host = req.get('host') || `localhost:${pot.port}`;
        serverUrl = `${proto}://${host}`;
      }
      const doc = buildOpenApiDocument({
        name: pot.name,
        key: pot.key,
        description: pot.description,
        serverUrl,
        fields: pot.fields ?? [],
        schema: pot.schema,
      });
      res.type('application/json').json(doc);
    });

    app.get(POT_OAS_PATHS.docs, (_req: Request, res: Response) => {
      res.type('html').send(swaggerUiHtml(pot.name));
    });

    const apiPaths = buildPotApiPaths(pot.key);

    app.post(apiPaths.collection, async (req: Request, res: Response) => {
      try {
        const body = req.body;
        if (validate && !validate(body)) {
          return res.status(400).json({
            error: 'Schema validation failed',
            details: validate.errors,
          });
        }
        const record = await this.records.create(
          pot.id,
          body as Record<string, unknown>,
        );
        return res.status(201).json({
          id: record.id,
          potId: record.potId,
          seq: record.seq,
          payload: record.payload,
          createdAt: record.createdAt.toISOString(),
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return res.status(500).json({ error: msg });
      }
    });

    app.get(apiPaths.collection, async (_req: Request, res: Response) => {
      try {
        const rows = await this.records.findByPot(pot.id);
        return res.json(
          rows.map((r) => ({
            id: r.id,
            potId: r.potId,
            seq: r.seq,
            payload: r.payload,
            createdAt: r.createdAt.toISOString(),
          })),
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return res.status(500).json({ error: msg });
      }
    });

    app.get(`${apiPaths.collection}/:id`, async (req: Request, res: Response) => {
      try {
        const row = await this.records.findById(pot.id, req.params.id);
        if (!row) return res.status(404).json({ error: 'Not found' });
        return res.json({
          id: row.id,
          potId: row.potId,
          seq: row.seq,
          payload: row.payload,
          createdAt: row.createdAt.toISOString(),
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return res.status(500).json({ error: msg });
      }
    });

    return app;
  }
}
