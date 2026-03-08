import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

interface HealthCheckMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  lastFailureTime: number;
}

const healthMetrics: Record<string, HealthCheckMetrics> = {
  '/health': {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    averageResponseTime: 0,
    lastFailureTime: 0
  },
  '/ready': {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    averageResponseTime: 0,
    lastFailureTime: 0
  },
  '/live': {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    averageResponseTime: 0,
    lastFailureTime: 0
  },
  '/metrics': {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    averageResponseTime: 0,
    lastFailureTime: 0
  }
};

/**
 * Middleware to collect health check metrics
 */
export function healthMetricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  const path = req.path;
  
  if (!healthMetrics[path]) {
    return next();
  }

  res.on('finish', () => {
    const responseTime = Date.now() - startTime;
    const metrics = healthMetrics[path];
    
    if (metrics) {
      metrics.totalRequests++;
      
      if (res.statusCode >= 200 && res.statusCode < 300) {
        metrics.successfulRequests++;
      } else {
        metrics.failedRequests++;
        metrics.lastFailureTime = Date.now();
      }
      
      // Calculate rolling average response time
      const total = metrics.successfulRequests + metrics.failedRequests;
      metrics.averageResponseTime = ((metrics.averageResponseTime * (total - 1)) + responseTime) / total;
      
      // Log metrics periodically
      if (total % 100 === 0) {
        logger.info('Health check metrics', {
          path,
          totalRequests: metrics.totalRequests,
          successRate: (metrics.successfulRequests / metrics.totalRequests) * 100,
          averageResponseTime: metrics.averageResponseTime,
          lastFailureTime: metrics.lastFailureTime
        });
      }
    }
  });
  
  next();
}

/**
 * Get current health check metrics
 */
export function getHealthMetrics(): Record<string, HealthCheckMetrics> {
  return healthMetrics;
}

/**
 * Get health check metrics for Prometheus export
 */
export function getPrometheusMetrics(): string {
  const metrics = getHealthMetrics();
  const now = Date.now();
  
  let output = '';
  
  for (const [path, data] of Object.entries(metrics)) {
    const cleanPath = path.replace(/\//g, '_');
    
    // Health check request count
    output += `# HELP health_check_requests_total Total number of health check requests\n`;
    output += `# TYPE health_check_requests_total counter\n`;
    output += `health_check_requests_total{path="${path}"} ${data.totalRequests}\n`;
    
    // Health check success count
    output += `# HELP health_check_success_total Total number of successful health check requests\n`;
    output += `# TYPE health_check_success_total counter\n`;
    output += `health_check_success_total{path="${path}"} ${data.successfulRequests}\n`;
    
    // Health check failure count
    output += `# HELP health_check_failure_total Total number of failed health check requests\n`;
    output += `# TYPE health_check_failure_total counter\n`;
    output += `health_check_failure_total{path="${path}"} ${data.failedRequests}\n`;
    
    // Health check success rate
    const successRate = data.totalRequests > 0 ? (data.successfulRequests / data.totalRequests) * 100 : 0;
    output += `# HELP health_check_success_rate Success rate of health check requests\n`;
    output += `# TYPE health_check_success_rate gauge\n`;
    output += `health_check_success_rate{path="${path}"} ${successRate}\n`;
    
    // Health check average response time
    output += `# HELP health_check_response_time_avg Average response time of health check requests\n`;
    output += `# TYPE health_check_response_time_avg gauge\n`;
    output += `health_check_response_time_avg{path="${path}"} ${data.averageResponseTime}\n`;
    
    // Time since last failure
    const timeSinceLastFailure = data.lastFailureTime > 0 ? now - data.lastFailureTime : 0;
    output += `# HELP health_check_time_since_last_failure Time since last health check failure\n`;
    output += `# TYPE health_check_time_since_last_failure gauge\n`;
    output += `health_check_time_since_last_failure{path="${path}"} ${timeSinceLastFailure}\n`;
    
    output += '\n';
  }
  
  return output;
}

/**
 * Health check metrics endpoint handler
 */
export function metricsHandler(req: Request, res: Response): void {
  try {
    const metrics = getHealthMetrics();
    const prometheusMetrics = getPrometheusMetrics();
    
    // If Accept header includes text/plain, return Prometheus format
    const acceptHeader = req.get('Accept') || '';
    if (acceptHeader.includes('text/plain')) {
      res.set('Content-Type', 'text/plain; charset=utf-8');
      res.status(200).send(prometheusMetrics);
    } else {
      // Return JSON format
      res.status(200).json({
        timestamp: new Date().toISOString(),
        metrics: metrics,
        prometheus: prometheusMetrics
      });
    }
  } catch (error) {
    logger.error('Metrics collection failed:', error);
    res.status(500).json({
      error: 'Metrics collection failed'
    });
  }
}

export default {
  healthMetricsMiddleware,
  getHealthMetrics,
  getPrometheusMetrics,
  metricsHandler
};