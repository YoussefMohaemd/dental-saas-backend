process.env.NODE_ENV ??= 'test';
process.env.PORT ??= '3001';
process.env.LOG_LEVEL ??= 'silent';
process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:27017/dental_saas_test';
process.env.AUTH_ACCESS_TOKEN_SECRET ??= 'test-access-token-secret-should-be-32-plus';
process.env.AUTH_REFRESH_TOKEN_SECRET ??= 'test-refresh-token-secret-should-be-32-plus';
process.env.AUTH_ACCESS_TOKEN_TTL_SECONDS ??= '900';
process.env.AUTH_REFRESH_TOKEN_TTL_SECONDS ??= '604800';
process.env.AUTH_JWT_ISSUER ??= 'dental-saas-backend-test';
process.env.AUTH_JWT_AUDIENCE ??= 'dental-saas-client-test';
process.env.AUTH_REFRESH_COOKIE_NAME ??= 'refresh_token';
process.env.AUTH_REFRESH_COOKIE_PATH ??= '/api/auth';
process.env.AUTH_REFRESH_COOKIE_SECURE ??= 'false';
process.env.AUTH_REFRESH_COOKIE_SAME_SITE ??= 'lax';
process.env.AUTH_REFRESH_COOKIE_HTTP_ONLY ??= 'true';

