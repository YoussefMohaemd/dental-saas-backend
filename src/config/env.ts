import 'dotenv/config';
import { z } from 'zod';

const DEV_ACCESS_TOKEN_SECRET = 'dev_access_token_secret_change_me_12345';
const DEV_REFRESH_TOKEN_SECRET = 'dev_refresh_token_secret_change_me_12345';

const parseBoolean = z.preprocess((value) => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') {
      return true;
    }

    if (normalized === 'false') {
      return false;
    }
  }

  return value;
}, z.boolean());

const optionalString = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}, z.string().optional());

const optionalNonNegativeInteger = z.preprocess((value) => {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return undefined;
    }

    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return value;
}, z.number().int().min(0).optional());

const buildTokenSecretSchema = (fallbackSecret: string) =>
  optionalString.default(fallbackSecret).pipe(z.string().min(32, 'Must be at least 32 characters'));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  CORS_ALLOWED_ORIGIN: z.string().min(1).default('http://localhost:4200'),
  MONGODB_URI: z.string().min(1).default('mongodb://127.0.0.1:27017/dental_saas_dev'),
  AUTH_ACCESS_TOKEN_SECRET: buildTokenSecretSchema(DEV_ACCESS_TOKEN_SECRET),
  AUTH_REFRESH_TOKEN_SECRET: buildTokenSecretSchema(DEV_REFRESH_TOKEN_SECRET),
  AUTH_ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  AUTH_REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().min(300).max(2_592_000).default(604_800),
  AUTH_JWT_ISSUER: z.string().min(1).default('dental-saas-backend'),
  AUTH_JWT_AUDIENCE: z.string().min(1).default('dental-saas-client'),
  AUTH_REFRESH_COOKIE_NAME: z.string().min(1).default('refresh_token'),
  AUTH_REFRESH_COOKIE_DOMAIN: optionalString,
  AUTH_REFRESH_COOKIE_PATH: z.string().startsWith('/').default('/api/auth'),
  AUTH_REFRESH_COOKIE_SECURE: parseBoolean.default(false),
  AUTH_REFRESH_COOKIE_SAME_SITE: z.enum(['strict', 'lax', 'none']).default('lax'),
  AUTH_REFRESH_COOKIE_HTTP_ONLY: parseBoolean.default(true),
  TRUST_PROXY_HOPS: optionalNonNegativeInteger.default(0),
  AUTH_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(60).max(86_400).default(900),
  AUTH_RATE_LIMIT_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10_000).default(20),
  AUTH_RATE_LIMIT_MAX_ATTEMPTS_PER_IP: z.coerce.number().int().min(1).max(100_000).default(100),
  AUTH_RATE_LIMIT_MAX_ATTEMPTS_PER_ACCOUNT: z.coerce.number().int().min(1).max(10_000).optional(),
});

const refinedEnvSchema = envSchema.superRefine((value, context) => {
  if (value.NODE_ENV === 'production' && value.AUTH_REFRESH_COOKIE_SECURE !== true) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['AUTH_REFRESH_COOKIE_SECURE'],
      message: 'Must be true in production',
    });
  }

  if (value.AUTH_REFRESH_COOKIE_SAME_SITE === 'none' && value.AUTH_REFRESH_COOKIE_SECURE !== true) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['AUTH_REFRESH_COOKIE_SAME_SITE'],
      message: 'sameSite=none requires AUTH_REFRESH_COOKIE_SECURE=true',
    });
  }

  if (value.NODE_ENV === 'production' && value.AUTH_ACCESS_TOKEN_SECRET === DEV_ACCESS_TOKEN_SECRET) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['AUTH_ACCESS_TOKEN_SECRET'],
      message: 'Must be overridden in production',
    });
  }

  if (value.NODE_ENV === 'production' && value.AUTH_REFRESH_TOKEN_SECRET === DEV_REFRESH_TOKEN_SECRET) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['AUTH_REFRESH_TOKEN_SECRET'],
      message: 'Must be overridden in production',
    });
  }
});

const parsedEnv = refinedEnvSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const issues = parsedEnv.error.issues
    .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
    .join('; ');

  throw new Error(`Invalid environment configuration: ${issues}`);
}

export const env = {
  ...parsedEnv.data,
  AUTH_RATE_LIMIT_MAX_ATTEMPTS_PER_ACCOUNT:
    parsedEnv.data.AUTH_RATE_LIMIT_MAX_ATTEMPTS_PER_ACCOUNT ?? parsedEnv.data.AUTH_RATE_LIMIT_MAX_ATTEMPTS,
};
