/**
 * Environment for integration tests. Points at an isolated `lanyard_test` database on
 * the dev Mongo replica set, and the dev Redis/MinIO. Override any of these via the
 * shell to target a different stack (e.g. CI service ports).
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ??= 'integration-test-secret-key-please';
process.env.MONGODB_URI ??=
  'mongodb://localhost:27117/lanyard_test?replicaSet=rs0&directConnection=true';
process.env.REDIS_URL ??= 'redis://localhost:6399';
process.env.S3_ENDPOINT ??= 'http://localhost:9000';
process.env.S3_REGION ??= 'us-east-1';
process.env.S3_ACCESS_KEY ??= 'minioadmin';
process.env.S3_SECRET_KEY ??= 'minioadmin';
process.env.S3_BUCKET ??= 'lanyard-dev';
process.env.PAYSTACK_SECRET_KEY = ''; // force the mock payment provider
process.env.ENABLE_DEV_PAYMENT_CONFIRM ??= 'true';
