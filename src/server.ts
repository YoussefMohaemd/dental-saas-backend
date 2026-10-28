import 'dotenv/config';
import mongoose from 'mongoose';

import { app } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { registerPersistenceModels } from './shared/infrastructure/persistence/mongoose';

let isShuttingDown = false;
let server: ReturnType<typeof app.listen> | undefined;
let forceShutdownTimer: NodeJS.Timeout | undefined;

const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  logger.warn({ signal }, 'Shutdown signal received');

  forceShutdownTimer = setTimeout(() => {
    logger.error('Forcing shutdown after timeout');
    process.exit(1);
  }, 10_000);
  forceShutdownTimer.unref();

  try {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server?.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }

    if (mongoose.connection.readyState !== mongoose.ConnectionStates.disconnected) {
      await mongoose.disconnect();
    }

    if (forceShutdownTimer) {
      clearTimeout(forceShutdownTimer);
      forceShutdownTimer = undefined;
    }

    logger.info('Server closed');
    process.exit(0);
  } catch (error) {
    logger.error({ err: error }, 'Graceful shutdown failed');
    process.exit(1);
  }
};

const startServer = async (): Promise<void> => {
  registerPersistenceModels();
  await mongoose.connect(env.MONGODB_URI);

  logger.info({ mongoTarget: redactMongoConnectionString(env.MONGODB_URI) }, 'MongoDB connection established');

  server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Backend service listening');
  });
};

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});
process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Uncaught exception');
  void shutdown('SIGTERM');
});

process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled rejection');
  void shutdown('SIGTERM');
});

void startServer().catch((error) => {
  logger.fatal({ err: sanitizeStartupError(error) }, 'Failed to start backend service');
  process.exit(1);
});

function sanitizeStartupError(error: unknown): { name: string; message: string; stack?: string } {
  if (!(error instanceof Error)) {
    return {
      name: 'UnknownError',
      message: 'Unexpected startup failure',
    };
  }

  const redactedMessage = redactStartupText(error.message);
  const redactedStack = error.stack ? redactStartupText(error.stack) : undefined;

  return {
    name: error.name,
    message: redactedMessage,
    ...(redactedStack ? { stack: redactedStack } : {}),
  };
}

function redactStartupText(value: string): string {
  const trimmedUri = env.MONGODB_URI.trim();
  if (trimmedUri.length === 0) {
    return value;
  }

  return value.replaceAll(trimmedUri, redactMongoConnectionString(trimmedUri));
}

function redactMongoConnectionString(uri: string): string {
  return uri.replace(/\/\/[^/@]*@/u, '//***:***@');
}
