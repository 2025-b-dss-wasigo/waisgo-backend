import * as Joi from 'joi';

export const envSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  FRONTEND_URL: Joi.string().uri().required(),

  DB_HOST: Joi.string().hostname().required(),
  DB_PORT: Joi.number().port().default(5432),
  DB_USERNAME: Joi.string().min(3).required(),
  DB_PASSWORD: Joi.string().min(3).required(),
  DB_NAME: Joi.string().min(3).required(),
  DB_SSL: Joi.boolean().default(false),
  DB_SSL_CA: Joi.string().optional(),

  DB_MIGRATION_USERNAME: Joi.string().required(),
  DB_MIGRATION_PASSWORD: Joi.string().required(),

  JWT_SECRET: Joi.string().length(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('8h'),
  OTP_SECRET: Joi.string().length(32).optional(),

  SWAGGER_ENABLED: Joi.boolean().optional(),
  SEED_ENABLED: Joi.boolean().optional(),

  TRUST_PROXY: Joi.boolean().default(false),

  PAYPAL_CLIENT_ID: Joi.string().required(),
  PAYPAL_SECRET: Joi.string().required(),
  PAYPAL_MODE: Joi.string().valid('sandbox', 'live').default('sandbox'),
  PAYPAL_BASE_URL: Joi.string().uri().required(),

  REDIS_HOST: Joi.string().hostname().required(),
  REDIS_PORT: Joi.number().port().default(6379),
  REDIS_PASSWORD: Joi.string().required(),

  MAIL_HOST: Joi.string().hostname().required(),
  MAIL_PORT: Joi.number().port().default(587),
  MAIL_USER: Joi.string().email().required(),
  MAIL_PASS: Joi.string().min(8).required(),
  MAIL_FROM: Joi.string().required(),

  // Rate Limiting (Throttler)
  THROTTLE_TTL: Joi.number().min(1000).default(60000),
  THROTTLE_LIMIT: Joi.number().min(1).default(100),

  CLEANUP_UNVERIFIED_DAYS: Joi.number().min(1).max(30).default(3),

  // OTP Configuration
  OTP_EXPIRATION_MINUTES: Joi.number().min(1).max(60).default(15),
  MAX_OTP_ATTEMPTS: Joi.number().min(1).max(10).default(3),
  MAX_OTP_RESENDS: Joi.number().min(1).max(10).default(3),

  // Security - Account blocking
  MAX_FAILED_ATTEMPTS: Joi.number().min(1).max(20).default(5),
  BLOCK_TIME_MINUTES: Joi.number().min(1).max(1440).default(15),

  // Password reset
  RESET_TOKEN_EXPIRY_MINUTES: Joi.number().min(5).max(120).default(30),
  MAX_RESET_ATTEMPTS: Joi.number().min(1).max(10).default(3),

  MINIO_ENDPOINT: Joi.string().hostname().required(),
  MINIO_PORT: Joi.number().port().default(9000),
  MINIO_ACCESS_KEY: Joi.string().required(),
  MINIO_SECRET_KEY: Joi.string().required(),
  MINIO_USE_SSL: Joi.boolean().default(false),

  // OCI Configuration
  OCI_CONFIG_PATH: Joi.string().optional(),
  OCI_CONFIG_PROFILE: Joi.string().optional(),
  OCI_NAMESPACE: Joi.string().optional(),
  OCI_REGION: Joi.string().optional(),

  STORAGE_DRIVER: Joi.string().valid('minio', 'oci').default('minio'),
  STORAGE_PROFILE_BUCKET: Joi.string().required(),
  STORAGE_DRIVER_BUCKET: Joi.string().required(),

  // Identifiers
  ALLOW_UUID_IDENTIFIERS: Joi.boolean().default(true),
});
