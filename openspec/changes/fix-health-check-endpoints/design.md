# Technical Design: Direct Backend Health Checks

**Change**: `fix-health-check-endpoints`  
**Document**: Design Specification  
**Version**: 1.0  
**Date**: 2026-03-08

## Architecture Overview

### Current vs Proposed Architecture

#### Current Architecture (Problematic)
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Load Balancer │    │ Frontend Server │    │  Backend Server │
│                 │    │   (Port 3000)   │    │   (Port 5000)   │
│  Health Check   │───▶│  /health (proxy)│───▶│  /health (real) │
│                 │    │                 │    │                 │
│  App Traffic    │───▶│  /api/* (proxy) │───▶│  /api/* (real)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │                        │
                              ▼                        ▼
                       ┌─────────────────┐    ┌─────────────────┐
                       │   CORS Issues   │    │   Ollama API    │
                       │   (Double CORS) │    │                 │
                       └─────────────────┘    └─────────────────┘
```

#### Proposed Architecture (Solution)
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Load Balancer │    │ Frontend Server │    │  Backend Server │
│                 │    │   (Port 3000)   │    │   (Port 5000)   │
│  Health Check   │──────────────────────────▶│  /health (direct)│
│                 │    │                 │    │                 │
│  App Traffic    │───▶│  /api/* (proxy) │───▶│  /api/* (real)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │                        │
                              ▼                        ▼
                       ┌─────────────────┐    ┌─────────────────┐
                       │   Enhanced CORS │    │   Ollama API    │
                       │   (Single CORS) │    │   (Protected)   │
                       └─────────────────┘    └─────────────────┘
```

## Component Design

### 1. Backend Health Check Enhancement

#### 1.1 Enhanced Health Check Endpoints

**File**: `src/routes/health.ts`

```typescript
// Enhanced readiness check with timeout and caching
interface HealthCheckCache {
  data: any;
  timestamp: number;
}

const readinessCache = new Map<string, HealthCheckCache>();
const CACHE_DURATION = 30000; // 30 seconds
const HEALTH_CHECK_TIMEOUT = 5000; // 5 seconds

// Circuit breaker state
interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
}

const circuitBreaker: CircuitBreakerState = {
  failures: 0,
  lastFailure: 0,
  isOpen: false
};

const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_RESET_TIMEOUT = 60000; // 1 minute

function updateCircuitBreaker(isSuccess: boolean): void {
  if (isSuccess) {
    circuitBreaker.failures = 0;
    circuitBreaker.isOpen = false;
  } else {
    circuitBreaker.failures++;
    circuitBreaker.lastFailure = Date.now();
    
    if (circuitBreaker.failures >= CIRCUIT_BREAKER_THRESHOLD) {
      circuitBreaker.isOpen = true;
      logger.warn('Circuit breaker opened due to repeated failures');
    }
  }
}

function isCircuitBreakerOpen(): boolean {
  if (!circuitBreaker.isOpen) return true;
  
  const timeSinceLastFailure = Date.now() - circuitBreaker.lastFailure;
  if (timeSinceLastFailure > CIRCUIT_BREAKER_RESET_TIMEOUT) {
    circuitBreaker.isOpen = false;
    circuitBreaker.failures = 0;
    logger.info('Circuit breaker reset after timeout');
    return true;
  }
  
  return false;
}

async function readyHandler(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();
  
  try {
    // Check cache first
    const cacheKey = 'ollama-readiness';
    const cached = readinessCache.get(cacheKey);
    const now = Date.now();
    
    if (cached && (now - cached.timestamp) < CACHE_DURATION) {
      logger.debug('Serving cached readiness check');
      return res.status(200).json(cached.data);
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
      return res.status(503).json(circuitBreakerResponse);
    }

    // Timeout protection with AbortController
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT);

    const ollamaResponse = await fetch(`${config.ollama.baseUrl}/api/tags`, {
      signal: controller.signal,
      timeout: HEALTH_CHECK_TIMEOUT
    });
    
    clearTimeout(timeoutId);

    const isOllamaReady = ollamaResponse.ok;
    const responseTime = Date.now() - startTime;
    
    // Update circuit breaker
    updateCircuitBreaker(isOllamaReady);

    const readinessCheck = {
      status: isOllamaReady ? 'ready' : 'not ready',
      timestamp: new Date().toISOString(),
      checks: {
        ollama: {
          status: isOllamaReady ? 'ok' : 'failed',
          url: config.ollama.baseUrl,
          responseTime: responseTime,
          statusCode: ollamaResponse.status
        }
      }
    };

    // Cache the result
    readinessCache.set(cacheKey, { data: readinessCheck, timestamp: now });

    if (!isOllamaReady) {
      logger.warn('Readiness check failed: Ollama not reachable', {
        statusCode: ollamaResponse.status,
        responseTime: responseTime
      });
      return res.status(503).json(readinessCheck);
    }

    logger.info('Readiness check passed', { responseTime });
    res.status(200).json(readinessCheck);
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
```

#### 1.2 Enhanced Liveness Check

```typescript
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
```

#### 1.3 Enhanced Metrics Endpoint

```typescript
function metricsHandler(req: Request, res: Response): void {
  try {
    const metrics = {
      timestamp: new Date().toISOString(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      uptime: process.uptime(),
      environment: config.server.nodeEnv,
      version: process.env['npm_package_version'] || '1.0.0',
      healthChecks: {
        cacheSize: readinessCache.size,
        circuitBreaker: {
          isOpen: circuitBreaker.isOpen,
          failures: circuitBreaker.failures,
          lastFailure: circuitBreaker.lastFailure
        }
      }
    };

    res.status(200).json(metrics);
  } catch (error) {
    logger.error('Metrics collection failed:', error);
    res.status(500).json({
      error: 'Metrics collection failed'
    });
  }
}
```

### 2. CORS Configuration Enhancement

#### 2.1 Production-Ready CORS Configuration

**File**: `src/middleware/security.ts`

```typescript
// Enhanced CORS configuration for production
export const corsOptions = {
  origin: function (origin: string | undefined, callback: any) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Development mode - allow all origins
    if (config.server.nodeEnv === 'development') {
      return callback(null, true);
    }
    
    // Production mode - strict origin checking
    const allowedOrigins = [
      // Load balancer IP ranges (to be configured per environment)
      ...getLoadBalancerOrigins(),
      
      // Frontend server
      `${config.frontend.host}:${config.frontend.port}`,
      
      // Supabase and GitHub for OAuth
      'https://supabase.co',
      'https://*.supabase.co',
      'https://github.com',
      'https://*.github.com'
    ];
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      logger.warn(`CORS blocked request from origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With',
    'X-Forwarded-For',
    'X-Real-IP'
  ],
  exposedHeaders: ['X-Total-Count', 'X-Response-Time'],
  optionsSuccessStatus: 200,
  maxAge: 86400 // 24 hours
};

function getLoadBalancerOrigins(): string[] {
  // Load from environment variables
  const lbOrigins = process.env['LOAD_BALANCER_ORIGINS'];
  if (lbOrigins) {
    return lbOrigins.split(',').map(origin => origin.trim());
  }
  
  // Default load balancer IP ranges for major cloud providers
  return [
    // AWS ALB ranges (these should be updated regularly)
    '10.0.0.0/8', // Private networks
    '172.16.0.0/12', // Private networks
    '192.168.0.0/16', // Private networks
    
    // Add specific cloud provider health check ranges as needed
  ];
}
```

#### 2.2 Environment-Specific CORS

**File**: `src/config/index.ts`

```typescript
// Enhanced CORS configuration schema
const configSchema = Joi.object({
  // ... existing config
  
  // CORS configuration
  CORS_ORIGIN: Joi.string().default('*'),
  LOAD_BALANCER_ORIGINS: Joi.string().optional().allow(''),
  
  // Health check configuration
  HEALTH_CHECK_TIMEOUT: Joi.number().default(5000),
  HEALTH_CHECK_CACHE_DURATION: Joi.number().default(30000),
  CIRCUIT_BREAKER_THRESHOLD: Joi.number().default(5),
  CIRCUIT_BREAKER_RESET_TIMEOUT: Joi.number().default(60000)
}).unknown();

export const config = {
  // ... existing config
  
  // Health check settings
  healthCheck: {
    timeout: envConfig.HEALTH_CHECK_TIMEOUT,
    cacheDuration: envConfig.HEALTH_CHECK_CACHE_DURATION,
    circuitBreaker: {
      threshold: envConfig.CIRCUIT_BREAKER_THRESHOLD,
      resetTimeout: envConfig.CIRCUIT_BREAKER_RESET_TIMEOUT
    }
  },
  
  // CORS settings
  cors: {
    origins: envConfig.LOAD_BALANCER_ORIGINS ? 
      envConfig.LOAD_BALANCER_ORIGINS.split(',') : 
      []
  }
};
```

### 3. Frontend Server Changes

#### 3.1 Remove Health Check Proxying

**File**: `src/frontend-server.ts`

```typescript
// Remove /health from proxy prefixes
const proxyPrefixes = ['/chat', '/auth', '/models', '/config', '/api'];
// REMOVED: '/health'

// Add direct frontend health endpoint
app.get('/health', (req: Request, res: Response) => {
  const healthCheck = {
    status: 'ok',
    service: 'frontend',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env['npm_package_version'] || '1.0.0',
    backendUrl: BACKEND_URL,
    environment: config.server.nodeEnv
  };

  logger.info('Frontend health check requested');
  res.status(200).json(healthCheck);
});

// Handle preflight OPTIONS requests for frontend health
app.options('/health', (_req: Request, res: Response) => {
  res.status(200).end();
});
```

#### 3.2 Enhanced Frontend CORS Configuration

```typescript
// Enhanced CORS configuration for frontend
const corsOptions = {
  origin: function (origin: string | undefined, callback: any) {
    // Allow requests with no origin
    if (!origin) return callback(null, true);
    
    // Development mode - allow all
    if (config.server.nodeEnv === 'development') {
      return callback(null, true);
    }
    
    // Production mode - strict checking
    const allowedOrigins = [
      // Frontend origins
      `${config.frontend.host}:${config.frontend.port}`,
      
      // Backend for proxy requests
      `${config.server.host}:${config.server.port}`,
      
      // OAuth providers
      'https://github.com',
      'https://*.github.com',
      'https://supabase.co',
      'https://*.supabase.co'
    ];
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      logger.warn(`Frontend CORS blocked request from origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Access-Control-Allow-Origin'],
  optionsSuccessStatus: 200
};
```

### 4. Load Balancer Configuration Templates

#### 4.1 AWS ALB Configuration

**File**: `deploy/aws/alb-health-check.yaml`

```yaml
HealthCheckConfig:
  Protocol: HTTP
  Port: '5000'
  Path: /health
  IntervalSeconds: 30
  TimeoutSeconds: 5
  HealthyThresholdCount: 2
  UnhealthyThresholdCount: 2
  Matcher:
    HttpCode: '200'

TargetGroupConfig:
  Protocol: HTTP
  Port: 5000
  VpcId: ${VPC_ID}
  HealthCheckProtocol: HTTP
  HealthCheckPort: 5000
  HealthCheckPath: /health
  HealthCheckIntervalSeconds: 30
  HealthCheckTimeoutSeconds: 5
  HealthyThresholdCount: 2
  UnhealthyThresholdCount: 2
  Matcher:
    HttpCode: '200'
```

#### 4.2 GCP Load Balancer Configuration

**File**: `deploy/gcp/health-check.yaml`

```yaml
apiVersion: compute/v1
kind: HealthCheck
metadata:
  name: ollama-chat-health-check
spec:
  type: HTTP
  httpHealthCheck:
    port: 5000
    requestPath: /health
    host: localhost
    proxyHeader: NONE
  checkIntervalSec: 30
  timeoutSec: 5
  healthyThreshold: 2
  unhealthyThreshold: 2
```

#### 4.3 Azure Load Balancer Configuration

**File**: `deploy/azure/health-check.json`

```json
{
  "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#",
  "contentVersion": "1.0.0.0",
  "resources": [
    {
      "type": "Microsoft.Network/loadBalancers",
      "apiVersion": "2020-05-01",
      "name": "ollama-chat-lb",
      "properties": {
        "frontendIPConfigurations": [
          {
            "name": "LoadBalancerFrontEnd",
            "properties": {
              "privateIPAllocationMethod": "Dynamic"
            }
          }
        ],
        "backendAddressPools": [
          {
            "name": "BackendPool"
          }
        ],
        "loadBalancingRules": [
          {
            "name": "LBRule",
            "properties": {
              "frontendIPConfiguration": {
                "id": "[variables('lbID')]/frontendIPConfigurations/LoadBalancerFrontEnd"
              },
              "backendAddressPool": {
                "id": "[variables('lbID')]/backendAddressPools/BackendPool"
              },
              "protocol": "Tcp",
              "frontendPort": 5000,
              "backendPort": 5000,
              "enableFloatingIP": true
            }
          }
        ],
        "probes": [
          {
            "name": "HealthProbe",
            "properties": {
              "protocol": "Http",
              "port": 5000,
              "requestPath": "/health",
              "intervalInSeconds": 30,
              "numberOfProbes": 2
            }
          }
        ]
      }
    }
  ]
}
```

### 5. Monitoring and Alerting

#### 5.1 Health Check Metrics

**File**: `src/middleware/metrics.ts`

```typescript
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
  }
};

export function healthMetricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  const path = req.path;
  
  if (!healthMetrics[path]) {
    return next();
  }

  res.on('finish', () => {
    const responseTime = Date.now() - startTime;
    const metrics = healthMetrics[path];
    
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
  });
  
  next();
}

export function getHealthMetrics(): Record<string, HealthCheckMetrics> {
  return healthMetrics;
}
```

#### 5.2 Alerting Configuration

**File**: `monitoring/alerts.yml`

```yaml
# Prometheus alerting rules for health checks
groups:
  - name: health-check-alerts
    rules:
      - alert: HealthCheckFailure
        expr: health_check_success_rate < 0.95
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Health check failure rate too high"
          description: "Health check success rate is {{ $value }}% for {{ $labels.path }}"
      
      - alert: HealthCheckResponseTime
        expr: health_check_response_time > 100
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Health check response time too high"
          description: "Health check response time is {{ $value }}ms for {{ $labels.path }}"
      
      - alert: OllamaServiceDown
        expr: ollama_readiness_status == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Ollama service is down"
          description: "Ollama service is not responding to readiness checks"
      
      - alert: CircuitBreakerOpen
        expr: circuit_breaker_open == 1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Circuit breaker is open"
          description: "Circuit breaker has been open for {{ $value }} minutes"
```

### 6. Testing Strategy

#### 6.1 Unit Tests

**File**: `src/routes/health.test.ts`

```typescript
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import app from '../app';

describe('Health Check Endpoints', () => {
  beforeEach(() => {
    // Clear cache and circuit breaker state
    readinessCache.clear();
    circuitBreaker.failures = 0;
    circuitBreaker.isOpen = false;
  });

  describe('GET /health', () => {
    it('should return 200 with health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'ok',
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        environment: expect.any(String)
      });
    });
  });

  describe('GET /ready', () => {
    it('should return 200 when Ollama is ready', async () => {
      // Mock successful Ollama response
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200
      });

      const response = await request(app)
        .get('/ready')
        .expect(200);

      expect(response.body.status).toBe('ready');
      expect(response.body.checks.ollama.status).toBe('ok');
    });

    it('should return 503 when Ollama is not ready', async () => {
      // Mock failed Ollama response
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500
      });

      const response = await request(app)
        .get('/ready')
        .expect(503);

      expect(response.body.status).toBe('not ready');
      expect(response.body.checks.ollama.status).toBe('failed');
    });

    it('should timeout after 5 seconds', async () => {
      // Mock timeout
      global.fetch = jest.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 6000))
      );

      const response = await request(app)
        .get('/ready')
        .expect(503);

      expect(response.body.error).toBe('Health check service error');
    });
  });

  describe('GET /live', () => {
    it('should return 200 with liveness status', async () => {
      const response = await request(app)
        .get('/live')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'alive',
        timestamp: expect.any(String),
        pid: expect.any(Number),
        uptime: expect.any(Number)
      });
    });
  });

  describe('GET /metrics', () => {
    it('should return 200 with system metrics', async () => {
      const response = await request(app)
        .get('/metrics')
        .expect(200);

      expect(response.body).toMatchObject({
        timestamp: expect.any(String),
        memory: expect.any(Object),
        cpu: expect.any(Object),
        uptime: expect.any(Number),
        environment: expect.any(String)
      });
    });
  });
});
```

#### 6.2 Integration Tests

**File**: `tests/integration/health-check.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { spawn } from 'child_process';
import { promisify } from 'util';
import sleep from 'sleep-promise';

describe('Health Check Integration Tests', () => {
  let backendProcess: any;

  beforeAll(async () => {
    // Start backend server
    backendProcess = spawn('node', ['dist/index.js'], {
      stdio: 'pipe',
      env: { ...process.env, NODE_ENV: 'test' }
    });

    // Wait for server to start
    await sleep(3000);
  });

  afterAll(async () => {
    // Stop backend server
    if (backendProcess) {
      backendProcess.kill();
    }
  });

  describe('Load Balancer Health Check Simulation', () => {
    it('should respond to health checks from load balancer IPs', async () => {
      // Simulate load balancer health check
      const response = await fetch('http://localhost:5000/health', {
        headers: {
          'X-Forwarded-For': '10.0.0.1', // Load balancer IP
          'User-Agent': 'ELB-HealthChecker/2.0'
        }
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.status).toBe('ok');
    });

    it('should handle multiple concurrent health checks', async () => {
      const requests = Array(10).fill(null).map(() => 
        fetch('http://localhost:5000/health')
      );

      const responses = await Promise.all(requests);
      
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });
  });

  describe('Circuit Breaker Behavior', () => {
    it('should open circuit breaker after repeated failures', async () => {
      // Mock Ollama as unavailable
      process.env.OLLAMA_API_URL = 'http://localhost:9999'; // Non-existent port

      // Make multiple readiness checks to trigger circuit breaker
      for (let i = 0; i < 6; i++) {
        await fetch('http://localhost:5000/ready');
        await sleep(100);
      }

      // Next request should be blocked by circuit breaker
      const response = await fetch('http://localhost:5000/ready');
      expect(response.status).toBe(503);
    });
  });
});
```

### 7. Deployment Strategy

#### 7.1 Blue-Green Deployment

**File**: `deploy/blue-green.sh`

```bash
#!/bin/bash

# Blue-Green Deployment Script for Health Check Fix

set -e

ENVIRONMENT=${1:-production}
NEW_VERSION=${2:-$(git rev-parse --short HEAD)}

echo "Starting blue-green deployment for health check fix..."
echo "Environment: $ENVIRONMENT"
echo "New Version: $NEW_VERSION"

# 1. Deploy to green environment
echo "Deploying to green environment..."
kubectl apply -f k8s/green-deployment.yaml -n $ENVIRONMENT

# 2. Wait for green deployment to be ready
echo "Waiting for green deployment to be ready..."
kubectl rollout status deployment/ollama-chat-green -n $ENVIRONMENT --timeout=300s

# 3. Run health checks on green environment
echo "Running health checks on green environment..."
GREEN_POD=$(kubectl get pods -n $ENVIRONMENT -l app=ollama-chat-green -o jsonpath='{.items[0].metadata.name}')
kubectl exec -n $ENVIRONMENT $GREEN_POD -- curl -f http://localhost:5000/health
kubectl exec -n $ENVIRONMENT $GREEN_POD -- curl -f http://localhost:5000/ready
kubectl exec -n $ENVIRONMENT $GREEN_POD -- curl -f http://localhost:5000/live

# 4. Update load balancer to point to green
echo "Updating load balancer to point to green..."
kubectl patch service ollama-chat-lb -n $ENVIRONMENT -p '{"spec":{"selector":{"version":"green"}}}'

# 5. Verify traffic is flowing to green
echo "Verifying traffic is flowing to green..."
sleep 30
kubectl get pods -n $ENVIRONMENT -l version=green

# 6. If successful, clean up blue environment
echo "Deployment successful. Cleaning up blue environment..."
kubectl delete deployment ollama-chat-blue -n $ENVIRONMENT

echo "Blue-green deployment completed successfully!"
```

#### 7.2 Rollback Strategy

**File**: `deploy/rollback.sh`

```bash
#!/bin/bash

# Rollback Script for Health Check Fix

set -e

ENVIRONMENT=${1:-production}

echo "Starting rollback to previous version..."
echo "Environment: $ENVIRONMENT"

# 1. Check if blue environment exists (previous version)
BLUE_EXISTS=$(kubectl get deployment ollama-chat-blue -n $ENVIRONMENT --ignore-not-found=true)

if [ -z "$BLUE_EXISTS" ]; then
  echo "ERROR: Blue environment not found. Cannot rollback."
  exit 1
fi

# 2. Update load balancer to point to blue
echo "Updating load balancer to point to blue..."
kubectl patch service ollama-chat-lb -n $ENVIRONMENT -p '{"spec":{"selector":{"version":"blue"}}}'

# 3. Wait for traffic to switch
echo "Waiting for traffic to switch to blue..."
sleep 60

# 4. Verify blue environment is healthy
echo "Verifying blue environment health..."
BLUE_POD=$(kubectl get pods -n $ENVIRONMENT -l app=ollama-chat-blue -o jsonpath='{.items[0].metadata.name}')
kubectl exec -n $ENVIRONMENT $BLUE_POD -- curl -f http://localhost:5000/health

# 5. Clean up green environment
echo "Rollback successful. Cleaning up green environment..."
kubectl delete deployment ollama-chat-green -n $ENVIRONMENT

echo "Rollback completed successfully!"
```

This comprehensive design document provides all the technical specifications needed to implement the direct backend health check architecture. It covers enhanced health check endpoints, CORS configuration, load balancer templates, monitoring, testing, and deployment strategies.