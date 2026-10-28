import cookieParser from 'cookie-parser';
import express from 'express';

import { env } from './config/env';
import { openApiRouter } from './docs/openapi.routes';
import { errorHandler } from './middleware/error-handler';
import { notFoundHandler } from './middleware/not-found';
import { requestLogger } from './middleware/request-logger';
import { securityHeadersMiddleware } from './middleware/security-headers';
import { authRateLimit } from './middleware/auth-rate-limit';
import { moduleRouter } from './modules';
import { requestContextMiddleware } from './shared/presentation/http/request-context';

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', env.TRUST_PROXY_HOPS);
app.use(requestLogger);
app.use(requestContextMiddleware);
app.use(securityHeadersMiddleware);
app.use(cookieParser());
app.use((req, res, next) => {
  const origin = req.header('origin');
  if (origin && origin !== env.CORS_ALLOWED_ORIGIN) {
    res.status(403).json({
      error: {
        code: 'FORBIDDEN_ORIGIN',
        message: 'Origin is not allowed',
      },
    });
    return;
  }

  res.header('Access-Control-Allow-Origin', origin ?? env.CORS_ALLOWED_ORIGIN);
  res.header('Vary', 'Origin');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-request-id');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(204).send();
    return;
  }

  next();
});
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
app.use('/api/auth/login', authRateLimit);
app.use((req, _res, next) => {
  if (req.url === '/api/order' || req.url.startsWith('/api/order/')) {
    req.url = req.url.replace('/api/order', '/api/v1/orders');
  }

  next();
});

app.use('/api', openApiRouter);
app.use('/api', moduleRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export { app };
