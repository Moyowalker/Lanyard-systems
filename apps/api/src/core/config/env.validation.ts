import { z } from 'zod';

function usesLocalMongoHost(uri: string): boolean {
  const normalized = uri.trim();

  if (!normalized.startsWith('mongodb://') && !normalized.startsWith('mongodb+srv://')) {
    return false;
  }

  const authority = normalized
    .replace(/^mongodb(\+srv)?:\/\//, '')
    .split('/')[0]
    .split('@')
    .at(-1);

  if (!authority) return false;

  return authority.split(',').some((segment) => {
    const host = segment
      .trim()
      .replace(/^\[/, '')
      .replace(/\](:\d+)?$/, '');
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  });
}

/**
 * Typed, validated environment. The app fails fast at boot if required vars are
 * missing or malformed (see ConfigModule wiring in app.module.ts).
 */
export const envSchema = z
  .object({
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

    // SMS delivery (Sendchamp in production; dev/test fall back to logging).
    SENDCHAMP_ACCESS_KEY: z.string().optional(),
    SENDCHAMP_SENDER_NAME: z.string().optional(),
    SENDCHAMP_BASE_URL: z.string().url().default('https://api.sendchamp.com/api/v1'),
    SENDCHAMP_SMS_ROUTE: z.string().default('non_dnd'),

    // Email delivery (SMTP relay)
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().optional(),
    SMTP_FROM: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().email().optional(),
    ),
    SMTP_SECURE: z.coerce.boolean().default(false),
    SMTP_REQUIRE_TLS: z.coerce.boolean().default(false),
    SMTP_TLS_REJECT_UNAUTHORIZED: z.coerce.boolean().default(true),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    RESEND_API_KEY: z.string().optional(),
    RESEND_FROM_EMAIL: z.string().email().optional(),
    RESEND_FROM_NAME: z.string().optional(),

    // Payments (Paystack at MVP)
    PAYSTACK_SECRET_KEY: z.string().optional(),
    PAYSTACK_WEBHOOK_SECRET: z.string().optional(),
    ENABLE_DEV_PAYMENT_CONFIRM: z.coerce.boolean().default(false),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV !== 'production') return;

    if (!value.REDIS_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['REDIS_URL'],
        message: 'REDIS_URL is required in production',
      });
    }

    for (const key of ['S3_ACCESS_KEY', 'S3_SECRET_KEY', 'S3_BUCKET'] as const) {
      if (!value[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required in production`,
        });
      }
    }

    if (!value.SENDCHAMP_ACCESS_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SENDCHAMP_ACCESS_KEY'],
        message: 'SENDCHAMP_ACCESS_KEY is required in production',
      });
    }

    if (!value.SENDCHAMP_SENDER_NAME) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SENDCHAMP_SENDER_NAME'],
        message: 'SENDCHAMP_SENDER_NAME is required in production',
      });
    }

    const hasResend = Boolean(
      value.RESEND_API_KEY && value.RESEND_FROM_EMAIL && value.RESEND_FROM_NAME,
    );
    const hasSmtp = Boolean(value.SMTP_HOST && value.SMTP_PORT && value.SMTP_FROM);
    if (!hasResend && !hasSmtp) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['RESEND_API_KEY'],
        message:
          'Production requires RESEND_API_KEY, RESEND_FROM_EMAIL, and RESEND_FROM_NAME, or a complete SMTP configuration',
      });
    }

    if ((value.SMTP_USER && !value.SMTP_PASS) || (!value.SMTP_USER && value.SMTP_PASS)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SMTP_USER'],
        message: 'SMTP_USER and SMTP_PASS must be provided together',
      });
    }

    if (!value.PAYSTACK_SECRET_KEY?.startsWith('sk_')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['PAYSTACK_SECRET_KEY'],
        message: 'PAYSTACK_SECRET_KEY must be a Paystack secret key beginning with sk_',
      });
    }

    if (!value.PAYSTACK_WEBHOOK_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['PAYSTACK_WEBHOOK_SECRET'],
        message: 'PAYSTACK_WEBHOOK_SECRET is required in production',
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

  if (parsed.data.NODE_ENV === 'production' && usesLocalMongoHost(parsed.data.MONGODB_URI)) {
    throw new Error(
      'Invalid environment configuration:\n' +
        '  - MONGODB_URI: production cannot use localhost. ' +
        'Set this to a MongoDB Atlas or other external replica-set URI.',
    );
  }

  return parsed.data;
}
