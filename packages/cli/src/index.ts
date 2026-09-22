#!/usr/bin/env node
import { createInterface } from 'readline';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import * as bcrypt from 'bcryptjs';
import { MongoClient } from 'mongodb';
import {
  APP_VERSION,
  DbConfig,
  DEFAULT_ADMIN_USERNAME,
} from '@datapot/shared';

async function main() {
  const [, , ...argv] = process.argv;
  const cmd = argv[0];
  const sub = argv[1];

  if (!cmd || cmd === 'help' || cmd === '--help') {
    printHelp();
    return;
  }

  if (cmd === 'status') {
    const cfg = loadConfig();
    if (!cfg) {
      console.log(`DataPot ${APP_VERSION}`);
      console.log('Status: uninitialized (no DBMS config)');
      return;
    }
    console.log(`DataPot ${APP_VERSION}`);
    console.log(`DB type: ${cfg.type}`);
    console.log(`DB url:  ${maskUrl(cfg.url)}`);
    return;
  }

  if (cmd === 'admin' && sub === 'reset-password') {
    const userFlag = flagValue(argv, '--user') || DEFAULT_ADMIN_USERNAME;
    const password =
      flagValue(argv, '--password') || (await prompt('New admin password: '));
    if (!password) {
      console.error('Password is required');
      process.exit(1);
    }
    await resetPassword(userFlag, password);
    console.log(`Password reset for user "${userFlag}"`);
    return;
  }

  console.error(`Unknown command: ${argv.join(' ')}`);
  printHelp();
  process.exit(1);
}

function printHelp() {
  console.log(`dpot — DataPot CLI

Usage:
  dpot status
  dpot admin reset-password [--user admin] [--password <pw>]

Environment:
  DPOT_CONFIG     Path to config.json
  DPOT_DATA_DIR   Data directory (default /data or ./.datapot-runtime)
`);
}

function resolveConfigPath(): string {
  if (process.env.DPOT_CONFIG) return process.env.DPOT_CONFIG;
  const dataDir = process.env.DPOT_DATA_DIR || '/data';
  const candidates = [
    join(dataDir, 'config.json'),
    join(process.cwd(), 'data', 'config.json'),
    join(process.cwd(), '.datapot-runtime', 'config.json'),
  ];
  return candidates.find((p) => existsSync(p)) || candidates[0];
}

function loadConfig(): DbConfig | null {
  const path = resolveConfigPath();
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as {
      type?: string;
      url?: string;
      db?: { type?: string; url?: string };
    };
    const type = raw.db?.type ?? raw.type;
    const url = raw.db?.url ?? raw.url;
    if (type === 'mongodb' && url) return { type: 'mongodb', url };
    return null;
  } catch {
    return null;
  }
}

async function resetPassword(username: string, password: string): Promise<void> {
  const cfg = loadConfig();
  if (!cfg) {
    throw new Error('No DBMS configured. System is uninitialized.');
  }
  const hash = await bcrypt.hash(password, 10);

  if (cfg.type !== 'mongodb') {
    throw new Error('Only MongoDB is supported');
  }
  const client = new MongoClient(cfg.url);
  await client.connect();
  try {
    const dbName = new URL(cfg.url).pathname.replace(/^\//, '') || 'datapot';
    const col = client.db(dbName).collection('users');
    const r = await col.updateOne(
      { username },
      { $set: { passwordHash: hash, updatedAt: new Date() } },
    );
    if (r.matchedCount === 0) throw new Error(`User not found: ${username}`);
  } finally {
    await client.close();
  }
}

function flagValue(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  if (i >= 0 && argv[i + 1]) return argv[i + 1];
  const pref = `${name}=`;
  const hit = argv.find((a) => a.startsWith(pref));
  return hit ? hit.slice(pref.length) : undefined;
}

function prompt(question: string): Promise<string> {
  if (process.env.DPOT_ADMIN_PASSWORD) {
    return Promise.resolve(process.env.DPOT_ADMIN_PASSWORD);
  }
  if (!process.stdin.isTTY) {
    return Promise.reject(new Error('Interactive TTY required (or pass --password)'));
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function maskUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = '****';
    return u.toString();
  } catch {
    return url;
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
