import { Request, Response } from 'express';
import { jest } from '@jest/globals';
import { 
  readyHandler, 
  liveHandler, 
  metricsHandler, 
  healthHandler 
} from './health';
import { config } from '../config';
import { logger } from '../utils/logger';

// Mock dependencies
jest.mock('../config');
jest.mock('../utils/logger');

const mockConfig = config as jest.Mocked<typeof config>;
const mockLogger = logger as jest.Mocked<typeof logger>;

describe('Health Check Endpoints', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: jest.Mock;

  beforeEach(() => {
    mockReq = {
      path: '/health',
      get: jest.fn()
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis()
    };
    mockNext = jest.fn();
    
    // Reset mocks
    jest.clearAllMocks();
    
    // Default config
    mockConfig.healthCheck = {
      timeout: 5000,
      cacheDuration: 30000,
      circuitBreaker: {
        threshold: 5,
        resetTimeout: 60000
      }
    };
    
    mockConfig.ollama = {
      baseUrl: 'http://localhost:11434',
      protocol: 'http',
      host: 'localhost',
      port: 11434
    };
  });

  describe('healthHandler', () => {
    it('should return health status', async () => {
      await healthHandler(mockReq as Request, mockRes as Response);
      
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        status: 'ok',
        service: 'backend',
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        version: expect.any(String),
        environment: expect.any(String),
        backendUrl: expect.any(String)
      });
    });

    it('should handle errors gracefully', async () => {
      mockRes.json = jest.fn().mockImplementation(() => {
        throw new Error('Test error');
      });

      await healthHandler(mockReq as Request, mockRes as Response);
      
      expect(mockLogger.error).toHaveBeenCalledWith('Health check failed:', expect.any(Error));
    });
  });

  describe('liveHandler', () => {
    it('should return liveness status', async () => {
      await liveHandler(mockReq as Request, mockRes as Response);
      
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        status: 'ok',
        service: 'backend',
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        version: expect.any(String),
        environment: expect.any(String),
        backendUrl: expect.any(String)
      });
    });

    it('should handle errors gracefully', async () => {
      mockRes.json = jest.fn().mockImplementation(() => {
        throw new Error('Test error');
      });

      await liveHandler(mockReq as Request, mockRes as Response);
      
      expect(mockLogger.error).toHaveBeenCalledWith('Liveness check failed:', expect.any(Error));
    });
  });

  describe('readyHandler', () => {
    beforeEach(() => {
      // Mock fetch for Ollama API calls
      global.fetch = jest.fn();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should return ready status when Ollama is available', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ models: [] })
      });

      await readyHandler(mockReq as Request, mockRes as Response);
      
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        status: 'ok',
        service: 'backend',
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        version: expect.any(String),
        environment: expect.any(String),
        backendUrl: expect.any(String),
        ollama: {
          status: 'ok',
          url: 'http://localhost:11434',
          models: [],
          responseTime: expect.any(Number)
        },
        cache: {
          enabled: true,
          hit: false,
          lastUpdated: expect.any(String)
        },
        circuitBreaker: {
          state: 'CLOSED',
          failures: 0,
          lastFailure: null
        }
      });
    });

    it('should return not ready status when Ollama is unavailable', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 503
      });

      await readyHandler(mockReq as Request, mockRes as Response);
      
      expect(mockRes.status).toHaveBeenCalledWith(503);
      expect(mockRes.json).toHaveBeenCalledWith({
        status: 'error',
        service: 'backend',
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        version: expect.any(String),
        environment: expect.any(String),
        backendUrl: expect.any(String),
        ollama: {
          status: 'error',
          url: 'http://localhost:11434',
          error: 'Ollama service is not available',
          responseTime: expect.any(Number)
        },
        cache: {
          enabled: true,
          hit: false,
          lastUpdated: expect.any(String)
        },
        circuitBreaker: {
          state: 'OPEN',
          failures: 1,
          lastFailure: expect.any(String)
        }
      });
    });

    it('should handle timeout scenarios', async () => {
      (global.fetch as jest.Mock).mockImplementationOnce(() => 
        new Promise(resolve => setTimeout(resolve, 6000))
      );

      await readyHandler(mockReq as Request, mockRes as Response);
      
      expect(mockRes.status).toHaveBeenCalledWith(503);
      expect(mockRes.json).toHaveBeenCalledWith({
        status: 'error',
        service: 'backend',
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        version: expect.any(String),
        environment: expect.any(String),
        backendUrl: expect.any(String),
        ollama: {
          status: 'timeout',
          url: 'http://localhost:11434',
          error: 'Ollama service timeout',
          responseTime: expect.any(Number)
        },
        cache: {
          enabled: true,
          hit: false,
          lastUpdated: expect.any(String)
        },
        circuitBreaker: {
          state: 'OPEN',
          failures: 1,
          lastFailure: expect.any(String)
        }
      });
    });

    it('should use cached response when available', async () => {
      // First call to populate cache
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ models: [] })
      });

      await readyHandler(mockReq as Request, mockRes as Response);
      
      // Reset mocks but keep cache populated
      jest.clearAllMocks();
      
      // Second call should use cache
      await readyHandler(mockReq as Request, mockRes as Response);
      
      expect(global.fetch).not.toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({
        status: 'ok',
        service: 'backend',
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        version: expect.any(String),
        environment: expect.any(String),
        backendUrl: expect.any(String),
        ollama: {
          status: 'ok',
          url: 'http://localhost:11434',
          models: [],
          responseTime: expect.any(Number)
        },
        cache: {
          enabled: true,
          hit: true,
          lastUpdated: expect.any(String)
        },
        circuitBreaker: {
          state: 'CLOSED',
          failures: 0,
          lastFailure: null
        }
      });
    });

    it('should handle circuit breaker open state', async () => {
      // Simulate circuit breaker being open
      const { circuitBreaker } = await import('./health');
      circuitBreaker.open();
      
      await readyHandler(mockReq as Request, mockRes as Response);
      
      expect(mockRes.status).toHaveBeenCalledWith(503);
      expect(mockRes.json).toHaveBeenCalledWith({
        status: 'error',
        service: 'backend',
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        version: expect.any(String),
        environment: expect.any(String),
        backendUrl: expect.any(String),
        ollama: {
          status: 'circuit_breaker_open',
          url: 'http://localhost:11434',
          error: 'Circuit breaker is open',
          responseTime: 0
        },
        cache: {
          enabled: true,
          hit: false,
          lastUpdated: expect.any(String)
        },
        circuitBreaker: {
          state: 'OPEN',
          failures: 5,
          lastFailure: expect.any(String)
        }
      });
    });
  });

  describe('metricsHandler', () => {
    it('should return metrics in JSON format by default', async () => {
      await metricsHandler(mockReq as Request, mockRes as Response);
      
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        timestamp: expect.any(String),
        metrics: expect.any(Object),
        prometheus: expect.any(String)
      });
    });

    it('should return Prometheus format when requested', async () => {
      mockReq.get = jest.fn().mockReturnValue('text/plain');
      
      await metricsHandler(mockReq as Request, mockRes as Response);
      
      expect(mockRes.set).toHaveBeenCalledWith('Content-Type', 'text/plain; charset=utf-8');
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.send).toHaveBeenCalledWith(expect.any(String));
    });

    it('should handle errors gracefully', async () => {
      mockRes.json = jest.fn().mockImplementation(() => {
        throw new Error('Test error');
      });

      await metricsHandler(mockReq as Request, mockRes as Response);
      
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Metrics collection failed'
      });
    });
  });
});