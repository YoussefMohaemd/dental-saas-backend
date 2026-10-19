import pinoHttp from 'pino-http';

import { logger } from '../config/logger';

export const requestLogger = pinoHttp({
  logger,
  customLogLevel(_req, res, error) {
    if (error || res.statusCode >= 500) {
      return 'error';
    }

    if (res.statusCode >= 400) {
      return 'warn';
    }

    return 'info';
  },
  serializers: {
    req(req: { method?: string; url?: string }) {
      return {
        method: req.method ?? 'UNKNOWN',
        url: req.url ?? '',
      };
    },
    res(res: { statusCode?: number }) {
      return {
        statusCode: res.statusCode ?? 0,
      };
    },
  },
});
