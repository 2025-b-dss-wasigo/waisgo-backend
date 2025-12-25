import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config();

const {
  DB_HOST,
  DB_PORT,
  DB_NAME,
  DB_MIGRATION_USERNAME,
  DB_MIGRATION_PASSWORD,
  DB_USERNAME,
  DB_SSL,
} = process.env;

const required = [
  'DB_HOST',
  'DB_PORT',
  'DB_NAME',
  'DB_MIGRATION_USERNAME',
  'DB_MIGRATION_PASSWORD',
  'DB_SSL',
];
const missing = required.filter((k) => !process.env[k]);

if (missing.length) {
  console.error(`[migration] Faltan variables: ${missing.join(', ')}`);
  process.exit(1);
}

const port = Number(DB_PORT);
if (isNaN(port) || port < 1 || port > 65535) {
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
