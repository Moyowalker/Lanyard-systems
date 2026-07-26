import { validateEnv } from './env.validation';

describe('validateEnv', () => {
  it('accepts Resend in production with blank SMTP fields', () => {
    const env = validateEnv({
      NODE_ENV: 'production',
      MONGODB_URI: 'mongodb+srv://user:password@example.mongodb.net/lanyard',
      REDIS_URL: 'redis://:password@redis:6379',
      JWT_SECRET: 'a-production-secret-with-enough-length',
      S3_ACCESS_KEY: 'access-key',
      S3_SECRET_KEY: 'secret-key',
      S3_BUCKET: 'lanyard-prod',
      SENDCHAMP_ACCESS_KEY: 'sendchamp-key',
      SENDCHAMP_SENDER_NAME: 'Lanyard',
      SMTP_HOST: '',
      SMTP_FROM: '',
      RESEND_API_KEY: 're_test_key',
      RESEND_FROM_EMAIL: 'notifications@lanyardpharmacy.com',
      RESEND_FROM_NAME: 'Lanyard Pharmacy',
      PAYSTACK_SECRET_KEY: 'sk_test_key',
      PAYSTACK_WEBHOOK_SECRET: 'sk_test_key',
    });

    expect(env.SMTP_FROM).toBeUndefined();
    expect(env.RESEND_FROM_EMAIL).toBe('notifications@lanyardpharmacy.com');
  });
});
