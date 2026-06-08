import { z } from 'zod';

/**
 * Typed, validated environment. The app fails fast at boot if required vars are
 * missing or malformed (see ConfigModule wiring in app.module.ts).
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  API_GLOBAL_PREFIX: z.string().default('api/v1'),

  // Data tier
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  REDIS_URL: z.string().optional(),

  // Object storage (prescriptions / documents)
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true), // true for MinIO/local
  S3_SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  PRESCRIPTION_MAX_FILE_MB: z.coerce.number().int().positive().default(10),

  // Web origins allowed to call the API (comma-separated)
  CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:3001'),

  // Auth
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 chars'),
  JWT_ISSUER: z.string().default('lanyard'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),
  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),

  // SMS delivery (Termii in production; dev/test fall back to logging).
  TERMII_API_KEY: z.string().optional(),
  TERMII_SENDER_ID: z.string().optional(),
  TERMII_BASE_URL: z.string().url().default('https://api.ng.termii.com'),
  TERMII_SMS_CHANNEL: z.string().default('generic'),

  // Email delivery (SMTP relay)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_FROM: z.string().email().optional(),
  SMTP_SECURE: z.coerce.boolean().default(false),
  SMTP_REQUIRE_TLS: z.coerce.boolean().default(false),
  SMTP_TLS_REJECT_UNAUTHORIZED: z.coerce.boolean().default(true),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),

  // Payments (Paystack at MVP)
  PAYSTACK_SECRET_KEY: z.string().optional(),
  PAYSTACK_WEBHOOK_SECRET: z.string().optional(),
}).superRefine((value, ctx) => {
  if (value.NODE_ENV !== 'production') return;

  if (!value.TERMII_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['TERMII_API_KEY'],
      message: 'TERMII_API_KEY is required in production',
    });
  }

  if (!value.TERMII_SENDER_ID) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['TERMII_SENDER_ID'],
      message: 'TERMII_SENDER_ID is required in production',
    });
  }

  if (!value.SMTP_HOST) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['SMTP_HOST'],
      message: 'SMTP_HOST is required in production',
    });
  }

  if (!value.SMTP_PORT) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['SMTP_PORT'],
      message: 'SMTP_PORT is required in production',
    });
  }

  if (!value.SMTP_FROM) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['SMTP_FROM'],
      message: 'SMTP_FROM is required in production',
    });
  }

  if ((value.SMTP_USER && !value.SMTP_PASS) || (!value.SMTP_USER && value.SMTP_PASS)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['SMTP_USER'],
      message: 'SMTP_USER and SMTP_PASS must be provided together',
    });
  }
});

export type Env = z.infer<typeof envSchema>;

/** Passed to `ConfigModule.forRoot({ validate })`. Throws on invalid env. */
export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
