import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { join } from 'path';
import { existsSync } from 'fs';
import { AppModule } from './app.module';
import { BootstrapService } from './bootstrap/bootstrap.service';
import { DatabaseService } from './database/database.service';
import { AuthService } from './auth/auth.service';
import { PotRuntimeService } from './pot-runtime/pot-runtime.service';
import { DEFAULT_WEB_PORT } from '@datapot/shared';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  app.setGlobalPrefix('api');
  app.enableCors({ origin: true, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const bootstrapService = app.get(BootstrapService);
  await bootstrapService.initialize();

  const db = app.get(DatabaseService);
  if (bootstrapService.ready && bootstrapService.config.db) {
    try {
      await db.connect(bootstrapService.config.db);
      const auth = app.get(AuthService);
      await auth.ensureSeedAdmin();
      const potRuntime = app.get(PotRuntimeService);
      await potRuntime.reloadAll();
    } catch (e) {
      console.error('Database connection failed at startup:', e);
    }
  }

  const webRootCandidates = [
    process.env.DPOT_WEB_ROOT,
    join(__dirname, '..', '..', 'web', 'dist'),
    join(process.cwd(), 'apps', 'web', 'dist'),
    '/app/web',
  ].filter(Boolean) as string[];

  const webRoot = webRootCandidates.find((p) => existsSync(p));
  if (webRoot) {
    app.useStaticAssets(webRoot);
    const expressApp = app.getHttpAdapter().getInstance();
    expressApp.use((req: { path: string; method: string }, res: { sendFile: (p: string) => void }, next: () => void) => {
      if (req.method === 'GET' && !req.path.startsWith('/api')) {
        const index = join(webRoot, 'index.html');
        if (existsSync(index)) {
          return res.sendFile(index);
        }
      }
      return next();
    });
  }

  const port = Number(process.env.DPOT_WEB_PORT || DEFAULT_WEB_PORT);
  await app.listen(port);
  console.log(`DataPot web API listening on :${port} (mode=${bootstrapService.mode})`);
}

bootstrap().catch((err) => {
  console.error('Failed to start DataPot:', err);
  process.exit(1);
});
