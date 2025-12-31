import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

const envPath = path.join(process.cwd(), '.env');
dotenv.config({ path: envPath });

const testEnvPath =
  process.env.TEST_ENV_FILE || path.join(process.cwd(), '.env.test');
const shouldUseTestEnv =
  process.env.NODE_ENV === 'test' || Boolean(process.env.TEST_DB_HOST);
if (shouldUseTestEnv && fs.existsSync(testEnvPath)) {
  dotenv.config({ path: testEnvPath, override: true });
}

const isTestEnv = process.env.NODE_ENV === 'test';

const resolveVar = (key: string, testKey: string): string | undefined => {
  if (isTestEnv && process.env[testKey]) {
    return process.env[testKey];
  }
  return process.env[key];
};

const DB_HOST = resolveVar('DB_HOST', 'TEST_DB_HOST');
const DB_PORT = resolveVar('DB_PORT', 'TEST_DB_PORT');
const DB_NAME = resolveVar('DB_NAME', 'TEST_DB_NAME');
const DB_USERNAME = resolveVar('DB_USERNAME', 'TEST_DB_USERNAME');
const DB_PASSWORD = resolveVar('DB_PASSWORD', 'TEST_DB_PASSWORD');
const DB_SSL = resolveVar('DB_SSL', 'TEST_DB_SSL');
const DB_MIGRATION_USERNAME =
  (isTestEnv ? process.env.TEST_DB_MIGRATION_USERNAME : undefined) ||
  process.env.DB_MIGRATION_USERNAME ||
  DB_USERNAME;
const DB_MIGRATION_PASSWORD =
  (isTestEnv ? process.env.TEST_DB_MIGRATION_PASSWORD : undefined) ||
  process.env.DB_MIGRATION_PASSWORD ||
  DB_PASSWORD;

const resolved = {
  DB_HOST,
  DB_PORT,
  DB_NAME,
  DB_MIGRATION_USERNAME,
  DB_MIGRATION_PASSWORD,
  DB_SSL,
};

const missing = Object.entries(resolved)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missing.length) {
  console.error(`[migration] Faltan variables: ${missing.join(', ')}`);
  process.exit(1);
}

const port = Number(DB_PORT);
if (Number.isNaN(port) || port < 1 || port > 65535) {
  console.error('[migration] DB_PORT invalido');
  process.exit(1);
}

if (DB_MIGRATION_USERNAME === DB_USERNAME) {
  console.warn(
    '[migration] Mismo usuario para app y migraciones - considera usar wasigo_migrator',
  );
}

const isSslEnabled = DB_SSL === 'true';

console.log(`[migration] Conectando como ${DB_MIGRATION_USERNAME}...`);
if (isTestEnv) {
  console.log(`[migration] NODE_ENV=test (DB=${DB_NAME})`);
}
console.log(`[migration] SSL habilitado: ${isSslEnabled}`);

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: DB_HOST,
  port,
  username: DB_MIGRATION_USERNAME,
  password: DB_MIGRATION_PASSWORD,
  database: DB_NAME,
  entities: [path.join(__dirname, 'src', '**', '*.entity.{ts,js}')],
  migrations: [path.join(__dirname, 'src', 'migrations', '*.{ts,js}')],
  synchronize: false,
  logging: ['error', 'schema'],
  ssl: isSslEnabled ? { rejectUnauthorized: false } : false,
  extra: {
    max: 5,
    connectionTimeoutMillis: 10000,
  },
});
