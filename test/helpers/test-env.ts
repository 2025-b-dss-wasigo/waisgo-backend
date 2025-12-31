import * as dotenv from 'dotenv';
import * as path from 'node:path';

type ConfigureTestEnvOptions = {
  requireTestDb?: boolean;
};

const setDefault = (key: string, value: string) => {
  if (!process.env[key]) {
    process.env[key] = value;
  }
};

export const configureTestEnv = (
  options: ConfigureTestEnvOptions = {},
): void => {
  const envPath =
    process.env.TEST_ENV_FILE || path.join(process.cwd(), '.env.test');
  dotenv.config({ path: path.join(process.cwd(), '.env') });
  dotenv.config({ path: envPath, override: true });

  setDefault('NODE_ENV', 'test');

  const hasTestDb = Boolean(process.env.TEST_DB_HOST);
  if (options.requireTestDb && !hasTestDb) {
    throw new Error(
      'Missing TEST_DB_* environment variables for integration/e2e tests.',
    );
  }

  if (hasTestDb) {
    process.env.DB_HOST = process.env.TEST_DB_HOST;
    process.env.DB_PORT = process.env.TEST_DB_PORT || process.env.DB_PORT;
    process.env.DB_USERNAME =
      process.env.TEST_DB_USERNAME || process.env.DB_USERNAME;
    process.env.DB_PASSWORD =
      process.env.TEST_DB_PASSWORD || process.env.DB_PASSWORD;
    process.env.DB_NAME = process.env.TEST_DB_NAME || process.env.DB_NAME;
    process.env.DB_SSL = process.env.TEST_DB_SSL || process.env.DB_SSL;
    process.env.DB_MIGRATION_USERNAME =
      process.env.TEST_DB_MIGRATION_USERNAME ||
      process.env.DB_MIGRATION_USERNAME ||
      process.env.DB_USERNAME;
    process.env.DB_MIGRATION_PASSWORD =
      process.env.TEST_DB_MIGRATION_PASSWORD ||
      process.env.DB_MIGRATION_PASSWORD ||
      process.env.DB_PASSWORD;
  }

  if (process.env.TEST_REDIS_HOST) {
    process.env.REDIS_HOST = process.env.TEST_REDIS_HOST;
    process.env.REDIS_PORT = process.env.TEST_REDIS_PORT || process.env.REDIS_PORT;
    process.env.REDIS_PASSWORD =
      process.env.TEST_REDIS_PASSWORD || process.env.REDIS_PASSWORD;
  }

  setDefault('FRONTEND_URL', 'http://localhost:3000');

  setDefault('DB_HOST', 'localhost');
  setDefault('DB_PORT', '5432');
  setDefault('DB_USERNAME', 'postgres');
  setDefault('DB_PASSWORD', 'postgres');
  setDefault('DB_NAME', 'wasigo_test');
  setDefault('DB_SSL', 'false');
  setDefault('DB_MIGRATION_USERNAME', 'postgres');
  setDefault('DB_MIGRATION_PASSWORD', 'postgres');

  setDefault('JWT_SECRET', '12345678901234567890123456789012');
  setDefault('JWT_EXPIRES_IN', '8h');

  setDefault('PAYPAL_CLIENT_ID', 'test');
  setDefault('PAYPAL_SECRET', 'test');
  setDefault('PAYPAL_BASE_URL', 'https://api.sandbox.paypal.com');

  setDefault('REDIS_HOST', 'localhost');
  setDefault('REDIS_PORT', '6379');
  setDefault('REDIS_PASSWORD', 'test');

  setDefault('MAIL_HOST', 'localhost');
  setDefault('MAIL_PORT', '587');
  setDefault('MAIL_USER', 'test@epn.edu.ec');
  setDefault('MAIL_PASS', 'password123');
  setDefault('MAIL_FROM', 'noreply@epn.edu.ec');

  setDefault('MINIO_ENDPOINT', 'localhost');
  setDefault('MINIO_PORT', '9000');
  setDefault('MINIO_ACCESS_KEY', 'minio');
  setDefault('MINIO_SECRET_KEY', 'miniosecret');
  setDefault('MINIO_USE_SSL', 'false');

  setDefault('STORAGE_DRIVER', 'minio');
  setDefault('STORAGE_PROFILE_BUCKET', 'profile-bucket');
  setDefault('STORAGE_DRIVER_BUCKET', 'driver-bucket');

  setDefault('ALLOW_UUID_IDENTIFIERS', 'true');
};
