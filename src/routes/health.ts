import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';
import { config } from '../config';
import { healthMetricsMiddleware } from '../middleware/metrics';

const router = Router();

// Apply health metrics middleware to all health check routes
router.use(healthMetricsMiddleware);

// Health check cache interface
interface HealthCheckCache {
  data: any;
  timestamp: number;
}

// Circuit breaker state interface
interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
}

// Health check cache implementation
const readinessCache = new Map<string, HealthCheckCache>();

// Circuit breaker implementation
const circuitBreaker: CircuitBreakerState = {
  failures: 0,
  lastFailure: 0,
  isOpen: false
};

// Circuit breaker state management
function updateCircuitBreaker(isSuccess: boolean): void {
  if (isSuccess) {
    circuitBreaker.failures = 0;
    circuitBreaker.isOpen = false;
  } else {
    circuitBreaker.failures++;
    circuitBreaker.lastFailure = Date.now();
    
    if (circuitBreaker.failures >= config.healthCheck.circuitBreaker.threshold) {
      circuitBreaker.isOpen = true;
      logger.warn('Circuit breaker opened due to repeated failures');
    }
  }
}

function isCircuitBreakerOpen(): boolean {
  if (!circuitBreaker.isOpen) return true;
  
  const timeSinceLastFailure = Date.now() - circuitBreaker.lastFailure;
  if (timeSinceLastFailure > config.healthCheck.circuitBreaker.resetTimeout) {
    circuitBreaker.isOpen = false;
    circuitBreaker.failures = 0;
    logger.info('Circuit breaker reset after timeout');
    return true;
  }
  
  return false;
}

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

// Ready check endpoint (for Kubernetes) - Enhanced with timeout, caching, and circuit breaker
async function readyHandler(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();
  
  try {
    // Check cache first
    const cacheKey = 'ollama-readiness';
    const cached = readinessCache.get(cacheKey);
    const now = Date.now();
    
    if (cached && (now - cached.timestamp) < config.healthCheck.cacheDuration) {
      logger.debug('Serving cached readiness check');
      res.status(200).json(cached.data);
      return;
    }

    // Circuit breaker check
    if (!isCircuitBreakerOpen()) {
      const circuitBreakerResponse = {
        status: 'not ready',
        timestamp: new Date().toISOString(),
        checks: {
          ollama: {
            status: 'circuit_open',
            reason: 'Circuit breaker open - Ollama service temporarily unavailable'
          }
        }
      };
      
      logger.warn('Readiness check blocked by circuit breaker');
      res.status(503).json(circuitBreakerResponse);
      return;
    }

    // Check Ollama service with timeout protection
    let isOllamaReady = false;
    let ollamaResponseTime = 0;
    let ollamaStatusCode = 0;
    
    try {
      // Timeout protection with AbortController
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.healthCheck.timeout);

      const ollamaResponse = await fetch(`${config.ollama.baseUrl}/api/tags`, {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      ollamaResponseTime = Date.now() - startTime;
      ollamaStatusCode = ollamaResponse.status;
      isOllamaReady = ollamaResponse.ok;
      
      logger.debug('Ollama readiness check completed', {
        url: config.ollama.baseUrl,
        statusCode: ollamaStatusCode,
        responseTime: ollamaResponseTime,
        ready: isOllamaReady
      });
    } catch (error) {
      ollamaResponseTime = Date.now() - startTime;
      ollamaStatusCode = 0;
      isOllamaReady = false;
      
      logger.warn('Ollama readiness check failed', {
        url: config.ollama.baseUrl,
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTime: ollamaResponseTime
      });
    }
    
    // Update circuit breaker
    updateCircuitBreaker(isOllamaReady);

    const readinessCheck = {
      status: isOllamaReady ? 'ready' : 'not ready',
      timestamp: new Date().toISOString(),
      checks: {
        ollama: {
          status: isOllamaReady ? 'ok' : 'failed',
          url: config.ollama.baseUrl,
          responseTime: ollamaResponseTime,
          statusCode: ollamaStatusCode
        }
      }
    };

    // Cache the result
    readinessCache.set(cacheKey, { data: readinessCheck, timestamp: now });

    if (!isOllamaReady) {
      logger.warn('Readiness check failed: Ollama not reachable', {
        statusCode: 0,
        responseTime: ollamaResponseTime
      });
      res.status(503).json(readinessCheck);
      return;
    }

    logger.info('Readiness check passed', { responseTime: ollamaResponseTime });
    res.status(200).json(readinessCheck);
    return;
  } catch (error) {
    updateCircuitBreaker(false);
    
    logger.error('Readiness check failed:', error);
    res.status(503).json({
      status: 'not ready',
      timestamp: new Date().toISOString(),
      error: 'Health check service error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

router.get('/ready', readyHandler);

// Liveness check endpoint (for Kubernetes) - Enhanced with better error handling
function liveHandler(req: Request, res: Response): void {
  const startTime = Date.now();
  
  try {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    const uptime = process.uptime();
    
    // Check if process is healthy (basic checks)
    const isMemoryHealthy = memoryUsage.heapUsed < memoryUsage.heapTotal * 0.9;
    const isUptimeHealthy = uptime > 0;
    
    const livenessCheck = {
      status: isMemoryHealthy && isUptimeHealthy ? 'alive' : 'unhealthy',
      timestamp: new Date().toISOString(),
      pid: process.pid,
      uptime: uptime,
      memory: {
        rss: memoryUsage.rss,
        heapTotal: memoryUsage.heapTotal,
        heapUsed: memoryUsage.heapUsed,
        external: memoryUsage.external,
        healthy: isMemoryHealthy
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system
      },
      responseTime: Date.now() - startTime
    };

    const statusCode = isMemoryHealthy && isUptimeHealthy ? 200 : 503;
    res.status(statusCode).json(livenessCheck);
  } catch (error) {
    logger.error('Liveness check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Liveness check failed'
    });
  }
}

router.get('/live', liveHandler);

// Metrics endpoint (enhanced with health check specific metrics)
function metricsHandler(req: Request, res: Response): void {
  try {
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
      environment: config.server.nodeEnv,
      version: process.env['npm_package_version'] || '1.0.0',
      healthChecks: {
        cacheSize: readinessCache.size,
        circuitBreaker: {
          isOpen: circuitBreaker.isOpen,
          failures: circuitBreaker.failures,
          lastFailure: circuitBreaker.lastFailure,
          threshold: config.healthCheck.circuitBreaker.threshold,
          resetTimeout: config.healthCheck.circuitBreaker.resetTimeout
        },
        timeouts: {
          timeoutDuration: config.healthCheck.timeout,
          cacheDuration: config.healthCheck.cacheDuration
        }
      }
    };

    logger.debug('Metrics requested');
    res.status(200).json(metrics);
  } catch (error) {
    logger.error('Metrics collection failed:', error);
    res.status(500).json({
      error: 'Metrics collection failed'
    });
  }
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
