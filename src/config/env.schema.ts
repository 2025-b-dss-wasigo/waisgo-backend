import * as Joi from 'joi';

export const envSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),
  FRONTEND_URL: Joi.string().uri().required(),

  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().default(5432),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_NAME: Joi.string().required(),

  JWT_SECRET: Joi.string().required().min(10),
  JWT_EXPIRES_IN: Joi.string().default('8h'),

  PAYPAL_CLIENT_ID: Joi.string().required(),
  PAYPAL_SECRET: Joi.string().required(),
  PAYPAL_MODE: Joi.string().valid('sandbox', 'live').default('sandbox'),
  PAYPAL_BASE_URL: Joi.string().uri().required(),

  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.number().default(6379),

  MAIL_HOST: Joi.string().required(),
  MAIL_PORT: Joi.number().default(587),
  MAIL_USER: Joi.string().required(),
  MAIL_PASS: Joi.string().required(),
  MAIL_FROM: Joi.string().required(),

  CLEANUP_UNVERIFIED_DAYS: Joi.number().default(7),
});
