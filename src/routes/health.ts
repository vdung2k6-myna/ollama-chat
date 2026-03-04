import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';
import { config } from '../config';

const router = Router();

// Health check endpoint
function healthHandler(req: Request, res: Response): void {
  const healthCheck = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.server.nodeEnv,
    version: process.env['npm_package_version'] || '1.0.0'
  };

  logger.info('Health check requested');
  res.status(200).json(healthCheck);
}

router.get('/', healthHandler);

// Handle preflight OPTIONS requests for health endpoints
router.options('/', (_req: Request, res: Response) => {
  res.status(200).end();
});

// Ready check endpoint (for Kubernetes)
async function readyHandler(req: Request, res: Response): Promise<void> {
  try {
    // Check if Ollama is reachable
    const ollamaResponse = await fetch(`${config.ollama.baseUrl}/api/tags`);
    const isOllamaReady = ollamaResponse.ok;

    const readinessCheck = {
      status: isOllamaReady ? 'ready' : 'not ready',
      timestamp: new Date().toISOString(),
      checks: {
        ollama: {
          status: isOllamaReady ? 'ok' : 'failed',
          url: config.ollama.baseUrl
        }
      }
    };

    if (!isOllamaReady) {
      logger.warn('Readiness check failed: Ollama not reachable');
      res.status(503).json(readinessCheck);
      return;
    }

    logger.info('Readiness check passed');
    res.status(200).json(readinessCheck);
  } catch (error) {
    logger.error('Readiness check failed:', error);
    res.status(503).json({
      status: 'not ready',
      timestamp: new Date().toISOString(),
      error: 'Ollama service unreachable'
    });
  }
}

router.get('/ready', readyHandler);

// Liveness check endpoint (for Kubernetes)
function liveHandler(req: Request, res: Response): void {
  const livenessCheck = {
    status: 'alive',
    timestamp: new Date().toISOString(),
    pid: process.pid,
    memory: process.memoryUsage(),
    cpu: process.cpuUsage()
  };

  logger.debug('Liveness check requested');
  res.status(200).json(livenessCheck);
}

router.get('/live', liveHandler);

// Metrics endpoint (basic system metrics)
function metricsHandler(req: Request, res: Response): void {
  const metrics = {
    timestamp: new Date().toISOString(),
    memory: {
      rss: process.memoryUsage().rss,
      heapTotal: process.memoryUsage().heapTotal,
      heapUsed: process.memoryUsage().heapUsed,
      external: process.memoryUsage().external
    },
    cpu: process.cpuUsage(),
    uptime: process.uptime(),
    environment: config.server.nodeEnv
  };

  logger.debug('Metrics requested');
  res.status(200).json(metrics);
}

router.get('/metrics', metricsHandler);

// Handle preflight OPTIONS requests for all health endpoints
router.options('/ready', (_req: Request, res: Response) => {
  res.status(200).end();
});

router.options('/live', (_req: Request, res: Response) => {
  res.status(200).end();
});

router.options('/metrics', (_req: Request, res: Response) => {
  res.status(200).end();
});

export default router;
