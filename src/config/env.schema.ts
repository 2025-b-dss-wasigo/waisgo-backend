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

  DB_MIGRATION_USERNAME: Joi.string().required(),
  DB_MIGRATION_PASSWORD: Joi.string().required(),

  JWT_SECRET: Joi.string().length(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('8h'),

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

  CLEANUP_UNVERIFIED_DAYS: Joi.number().min(1).max(30).default(7),
});
